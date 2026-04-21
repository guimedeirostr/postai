import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import {
  loadClientContext,
  runPhaseWithCtx,
  buildInput,
  loadUpstreamOutputs,
} from "@/lib/canvas/runPhase";
import type { PhaseId } from "@/types";

// Image generation can take up to 55 s — allow margin for retries.
export const maxDuration = 120;

type RunPhaseBody = {
  clientId:    string;
  flowId:      string;
  phaseId:     PhaseId;
  forceRerun?: boolean;
};

function encode(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function jsonError(msg: string, code: string, status: number) {
  return new Response(
    JSON.stringify({ error: msg, code }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body: RunPhaseBody = await req.json();
  const { clientId, flowId, phaseId, forceRerun = false } = body;

  if (!clientId) return jsonError("clientId obrigatório",  "MISSING_CLIENT_ID",  400);
  if (!flowId)   return jsonError("flowId obrigatório",    "MISSING_FLOW_ID",    400);
  if (!phaseId)  return jsonError("phaseId obrigatório",   "MISSING_PHASE_ID",   400);

  const uid = user.uid;

  // Parse composite flowId → realFlowId (format: "{clientId}_{realFlowId}")
  if (flowId.startsWith("new")) return jsonError("flowId inválido — salve o canvas primeiro", "FLOW_NOT_SAVED", 400);
  const parts      = flowId.split("_");
  const realFlowId = parts.length > 1 ? parts.slice(1).join("_") : null;
  if (!realFlowId) return jsonError("flowId inválido", "INVALID_FLOW_ID", 400);

  // Load flow doc
  const flowSnap = await adminDb.doc(paths.flow(uid, clientId, realFlowId)).get();
  if (!flowSnap.exists) return jsonError("Flow não encontrado", "FLOW_NOT_FOUND", 404);
  const flowData    = flowSnap.data()!;
  const latestRunId = flowData.latestRunId as string | undefined;

  // Load client context
  const ctx = await loadClientContext(uid, clientId);
  if (!ctx) return jsonError("Cliente não encontrado", "CLIENT_NOT_FOUND", 404);

  const stream = new ReadableStream({
    async start(controller) {
      let runId = latestRunId;
      try {
        // ── Load upstream outputs once ───────────────────────────────────────
        let accum: Record<string, unknown> = {};
        let cachedPhaseOutput: Record<string, unknown> | null = null;

        if (latestRunId) {
          const phaseRunsSnap = await adminDb.collection(paths.phaseRuns(uid, clientId, latestRunId)).get();
          const allDocs = phaseRunsSnap.docs.map(d => d.data());

          // Build accum from all done phases
          const doneDocs = allDocs
            .filter(d => d.status === "done")
            .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
          for (const doc of doneDocs) {
            if (doc.output && typeof doc.output === "object") Object.assign(accum, doc.output);
          }

          // Find the latest done phaseRun for this specific phaseId (for cache check)
          if (!forceRerun) {
            const cached = allDocs
              .filter(d => d.phaseId === phaseId && d.status === "done")
              .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
            if (cached?.output) cachedPhaseOutput = cached.output as Record<string, unknown>;
          }
        }

        // ── Return cached result if available and forceRerun=false ───────────
        if (cachedPhaseOutput) {
          controller.enqueue(encode({ type: "run_started", flowId, runId: latestRunId }));
          controller.enqueue(encode({ type: "phase_start", phaseId }));
          controller.enqueue(encode({ type: "phase_done",  phaseId, output: cachedPhaseOutput, cached: true }));
          controller.enqueue(encode({ type: "run_complete", flowId, runId: latestRunId }));
          controller.close();
          return;
        }

        // ── Create a CanvasRun doc if none exists yet ────────────────────────
        if (!runId) {
          const runRef = adminDb.collection(paths.canvasRuns(uid, clientId)).doc();
          runId = runRef.id;
          await runRef.set({
            id:          runId,
            clientId,
            mode:        "single-phase",
            startedAt:   Date.now(),
            finalStatus: "draft",
            createdBy:   uid,
          });
          await adminDb.doc(paths.flow(uid, clientId, realFlowId)).update({ latestRunId: runId });
        }

        // ── Stream execution ─────────────────────────────────────────────────
        controller.enqueue(encode({ type: "run_started", flowId, runId }));
        controller.enqueue(encode({ type: "phase_start", phaseId }));

        const emit: import("@/types").TraceEmitter = (entry) =>
          controller.enqueue(encode({ type: "node_trace", phaseId, slideN: null, ...entry }));

        const input = buildInput(phaseId, accum);

        try {
          const result = await runPhaseWithCtx({
            uid, clientId, phaseId, input,
            triggeredBy: "step",
            runId,
            flowId,
            ctx,
            emit,
          });
          controller.enqueue(encode({ type: "phase_done", phaseId, output: result.output }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encode({ type: "phase_error", phaseId, error: msg }));
        }

        controller.enqueue(encode({ type: "run_complete", flowId, runId }));
      } catch (err) {
        console.error("[run-phase] unhandled error", { phaseId, err: (err as Error).message });
        controller.enqueue(encode({ type: "run_complete", flowId, runId: runId ?? "unknown", error: true }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
