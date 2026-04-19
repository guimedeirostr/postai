import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { CANVAS_GRAPH } from "@/lib/canvas/staleness";
import type { PhaseId, BriefingInput } from "@/types";

type RunBody = {
  clientId: string;
  mode: "step" | "checkpoint" | "run-all";
  checkpointAt?: PhaseId;
  briefing: BriefingInput;
};

// Topological order respecting CANVAS_GRAPH (briefing → plano → prompt/copy → critico → output → memoria)
const TOPO_ORDER: PhaseId[] = ["briefing", "memoria", "plano", "prompt", "copy", "critico", "output"];

function buildRunOrder(upTo?: PhaseId): PhaseId[] {
  if (!upTo) return TOPO_ORDER;
  const idx = TOPO_ORDER.indexOf(upTo);
  return idx === -1 ? TOPO_ORDER : TOPO_ORDER.slice(0, idx + 1);
}

function encode(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body: RunBody = await req.json();
  const { clientId, mode, checkpointAt, briefing } = body;

  if (!clientId) {
    return new Response("clientId obrigatório", { status: 400 });
  }

  const uid = user.uid;
  const startedAt = Date.now();

  // Create CanvasRun
  const runRef = adminDb.collection(paths.canvasRuns(uid, clientId)).doc();
  const runId = runRef.id;
  await runRef.set({
    id: runId,
    clientId,
    briefingSnapshot: briefing,
    mode,
    checkpointAt: checkpointAt ?? null,
    startedAt,
    finalStatus: "draft",
    createdBy: uid,
  });

  const phases = buildRunOrder(mode === "run-all" ? undefined : checkpointAt);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const phaseId of phases) {
          controller.enqueue(encode({ type: "phase_start", phaseId, runId }));

          const phaseRunRef = adminDb.collection(paths.phaseRuns(uid, clientId, runId)).doc();
          const phaseRunId = phaseRunRef.id;
          const phaseStartedAt = Date.now();

          await phaseRunRef.set({
            id: phaseRunId,
            phaseId,
            status: "running",
            inputHash: "",
            input: { ...briefing } as Record<string, unknown>,
            startedAt: phaseStartedAt,
            triggeredBy: mode === "step" ? "step" : "run-all",
          });

          try {
            const runRes = await fetch(`${appUrl}/api/canvas/phase/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ clientId, phaseId, input: { ...briefing }, triggeredBy: mode === "step" ? "step" : "run-all", runId }),
            });

            const json = await runRes.json();
            if (!runRes.ok) throw new Error(json.error ?? "Erro na fase");

            controller.enqueue(encode({ type: "phase_done", phaseId, output: json.output, runId }));

            // Checkpoint pause
            if (mode === "checkpoint" && checkpointAt && phaseId === checkpointAt) {
              controller.enqueue(encode({ type: "checkpoint_reached", phaseId, runId }));
              break;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            controller.enqueue(encode({ type: "phase_error", phaseId, error: msg, runId }));
            break;
          }
        }

        controller.enqueue(encode({ type: "run_complete", runId }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
