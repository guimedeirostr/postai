import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { runPhase } from "@/lib/canvas/runPhase";
import type { PhaseId, PhaseRun } from "@/types";

export const maxDuration = 60;

type RunBody = {
  clientId:    string;
  phaseId:     PhaseId;
  input:       Record<string, unknown>;
  triggeredBy: PhaseRun["triggeredBy"];
  runId?:      string;
  flowId?:     string;
};

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: RunBody = await req.json();
  const { clientId, phaseId, input, triggeredBy, runId: existingRunId, flowId } = body;

  if (!clientId || !phaseId) {
    return NextResponse.json({ error: "clientId e phaseId obrigatórios", code: "MISSING_PARAMS" }, { status: 400 });
  }

  const uid = user.uid;
  const startedAt = Date.now();

  // Ensure CanvasRun document exists
  const runId = existingRunId ?? adminDb.collection(paths.canvasRuns(uid, clientId)).doc().id;
  const runRef = adminDb.doc(paths.canvasRun(uid, clientId, runId));
  const runSnap = await runRef.get();
  if (!runSnap.exists) {
    await runRef.set({
      id: runId,
      clientId,
      briefingSnapshot: input,
      mode: "step",
      startedAt,
      finalStatus: "draft",
      createdBy: uid,
    });
  }

  try {
    const result = await runPhase({ uid, clientId, phaseId, input, triggeredBy: triggeredBy ?? "step", runId, flowId });
    return NextResponse.json({ phaseRunId: result.phaseRunId, runId, output: result.output });
  } catch (err) {
    const msg  = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code ?? "PHASE_ERROR";
    const details = (err as { details?: unknown }).details;
    console.error(`[canvas/phase/run] phaseId=${phaseId} error:`, err);
    return NextResponse.json(
      { error: msg, code, details },
      { status: code === "NOT_FOUND" ? 404 : 500 },
    );
  }
}
