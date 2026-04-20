import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import type { PhaseId, PhaseRun, ClientContext } from "@/types";

type RunBody = {
  clientId: string;
  phaseId: PhaseId;
  input: Record<string, unknown>;
  triggeredBy: PhaseRun["triggeredBy"];
  runId?: string;
};

async function loadClientContext(uid: string, clientId: string): Promise<ClientContext | null> {
  const [clientSnap, brandKitSnap, memorySnap, dnaSnap] = await Promise.all([
    adminDb.collection("clients").doc(clientId).get(),
    adminDb.doc(paths.brandKit(uid, clientId)).get(),
    adminDb.doc(paths.memory(uid, clientId)).get(),
    adminDb.doc(`clients/${clientId}/brand_dna/current`).get(),
  ]);
  if (!clientSnap.exists || clientSnap.data()?.agency_id !== uid) return null;

  let recentApprovedPosts: ClientContext["recentApprovedPosts"] = [];
  try {
    const postsSnap = await adminDb.collection("posts")
      .where("client_id", "==", clientId)
      .where("status", "==", "approved")
      .orderBy("created_at", "desc")
      .limit(10)
      .get();
    recentApprovedPosts = postsSnap.docs.map(d => {
      const p = d.data();
      return { id: d.id, coverUrl: p.image_url ?? "", copy: p.caption ?? "" };
    });
  } catch (postsErr: unknown) {
    if ((postsErr as { code?: number }).code === 9) {
      console.warn("[loadClientContext] Composite index missing for posts query — deploy firestore indexes");
    } else {
      throw postsErr;
    }
  }

  return {
    clientId,
    clientName: clientSnap.data()?.name ?? "",
    brandKit:     brandKitSnap.exists ? (brandKitSnap.data() as ClientContext["brandKit"]) : undefined,
    clientMemory: memorySnap.exists   ? (memorySnap.data()   as ClientContext["clientMemory"]) : undefined,
    dnaVisual:    dnaSnap.exists      ? (dnaSnap.data()      as ClientContext["dnaVisual"]) : undefined,
    recentApprovedPosts,
    loadedAt: Date.now(),
  };
}

// ── Phase executors ───────────────────────────────────────────────────────────

async function executePlano(input: Record<string, unknown>, ctx: ClientContext): Promise<Record<string, unknown>> {
  const { objetivo, formato } = input as Record<string, string>;
  const patternsLearned = ctx.clientMemory?.toneExamples ?? [];
  const identidadeVisual = ctx.dnaVisual;
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/director/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: ctx.clientId,
      objetivo,
      formato: formato ?? "feed",
      clientName: ctx.clientName,
      patternsLearned,
      identidadeVisual,
    }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Erro ao gerar plano");
  return res.json();
}

async function executeMemoria(_input: Record<string, unknown>, ctx: ClientContext): Promise<Record<string, unknown>> {
  return {
    memory: ctx.clientMemory ?? null,
    clientId: ctx.clientId,
    clientName: ctx.clientName,
  };
}

async function stub(name: string): Promise<Record<string, unknown>> {
  await new Promise(r => setTimeout(r, 800));
  return { placeholder: true, phase: name };
}

async function dispatchPhase(
  phaseId: PhaseId,
  input: Record<string, unknown>,
  ctx: ClientContext,
): Promise<Record<string, unknown>> {
  switch (phaseId) {
    case "briefing":   return { ...input };
    case "plano":      return executePlano(input, ctx);
    case "memoria":    return executeMemoria(input, ctx);
    case "compilacao": return stub("compilacao");
    case "prompt":     return stub("prompt");
    case "copy":       return stub("copy");
    case "critico":    return stub("critico");
    case "output":     return stub("output");
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

  // Load client context (validates ownership too)
  const ctx = await loadClientContext(uid, clientId);
  if (!ctx) {
    return NextResponse.json({ error: "client_not_found" }, { status: 404 });
  }

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
    clientId,
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
    output = await dispatchPhase(phaseId, input, ctx);
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
