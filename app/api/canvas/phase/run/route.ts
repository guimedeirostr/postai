import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { PhaseId, PhaseRun } from "@/types";

type RunBody = {
  clientId: string;
  phaseId: PhaseId;
  input: Record<string, unknown>;
  triggeredBy: PhaseRun["triggeredBy"];
  runId?: string;
};

// ── Phase executors ───────────────────────────────────────────────────────────

async function executePlano(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { clientId, objetivo, formato, clientName } = input as Record<string, string>;
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/director/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, objetivo, formato: formato ?? "feed", clientName }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao gerar plano");
  return res.json();
}

async function executeMemoria(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { clientId } = input as { clientId: string };
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/clients/${clientId}/memory`);
  if (!res.ok) return { memory: null };
  return res.json();
}

async function stub(name: string): Promise<Record<string, unknown>> {
  await new Promise(r => setTimeout(r, 800));
  return { placeholder: true, phase: name };
}

async function dispatchPhase(
  phaseId: PhaseId,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (phaseId) {
    case "briefing": return { ...input };
    case "plano":    return executePlano(input);
    case "memoria":  return executeMemoria(input);
    case "prompt":   return stub("prompt");
    case "copy":     return stub("copy");
    case "critico":  return stub("critico");
    case "output":   return stub("output");
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: RunBody = await req.json();
  const { clientId, phaseId, input, triggeredBy, runId: existingRunId } = body;

  if (!clientId || !phaseId) {
    return NextResponse.json({ error: "clientId e phaseId obrigatórios" }, { status: 400 });
  }

  const uid = user.uid;
  const startedAt = Date.now();

  // Ensure CanvasRun exists
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

  // Create PhaseRun doc
  const phaseRunRef = adminDb.collection(paths.phaseRuns(uid, clientId, runId)).doc();
  const phaseRunId = phaseRunRef.id;

  await phaseRunRef.set({
    id: phaseRunId,
    phaseId,
    status: "running",
    inputHash: "",
    input,
    startedAt,
    triggeredBy,
  } satisfies Omit<PhaseRun, "id"> & { id: string });

  // Execute phase
  let output: Record<string, unknown>;
  let errorMessage: string | undefined;
  const finishedAt = Date.now();

  try {
    output = await dispatchPhase(phaseId, input);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await phaseRunRef.update({
      status: "error",
      errorMessage,
      finishedAt: Date.now(),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }

  await phaseRunRef.update({
    status: "done",
    output,
    finishedAt,
    latencyMs: finishedAt - startedAt,
  });

  return NextResponse.json({ phaseRunId, runId, output });
}
