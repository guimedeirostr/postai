import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { runDirectorPlan } from "@/lib/director/plan";
import { runDirectorCopy } from "@/lib/director/copy";
import { runDirectorImage } from "@/lib/director/image";
import { runDirectorCritic } from "@/lib/director/critic";
import type { PhaseId, PhaseRun, ClientContext, PlanoDePost } from "@/types";

export const maxDuration = 60;

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
  const plan = await runDirectorPlan({
    objetivo,
    formato:      formato ?? "feed",
    clientName:   ctx.clientName,
    brandKit:     ctx.brandKit,
    clientMemory: ctx.clientMemory,
  });
  return { plan };
}

async function executeMemoria(_input: Record<string, unknown>, ctx: ClientContext): Promise<Record<string, unknown>> {
  return {
    memory: ctx.clientMemory ?? null,
    clientId: ctx.clientId,
    clientName: ctx.clientName,
  };
}

async function executeCopy(input: Record<string, unknown>, ctx: ClientContext, uid: string): Promise<Record<string, unknown>> {
  const { objetivo, formato, plan } = input as { objetivo?: string; formato?: string; plan?: PlanoDePost };
  const result = await runDirectorCopy({
    uid,
    clientId:  ctx.clientId,
    objetivo:  objetivo ?? '',
    formato:   formato  ?? 'feed',
    plan,
  });
  return result as unknown as Record<string, unknown>;
}

async function executeImage(input: Record<string, unknown>, ctx: ClientContext): Promise<Record<string, unknown>> {
  const { compiledText, formato, model, slideN } = input as {
    compiledText?: string;
    formato?: string;
    model?: string;
    slideN?: number;
  };

  const { imageUrl } = await runDirectorImage({
    clientId:       ctx.clientId,
    promptCompilado: compiledText ?? '',
    formato:        formato ?? 'feed',
    model:          model as Parameters<typeof runDirectorImage>[0]['model'],
    slideN,
  });
  return { imageUrl };
}

async function executeCritic(input: Record<string, unknown>, ctx: ClientContext): Promise<Record<string, unknown>> {
  const { imageUrl, brief, slideN } = input as { imageUrl?: string; brief?: string; slideN?: number };

  if (!imageUrl) throw Object.assign(new Error('imageUrl ausente para fase critico'), { code: 'MISSING_INPUT' });
  if (!brief)    throw Object.assign(new Error('brief ausente para fase critico'),    { code: 'MISSING_INPUT' });

  const result = await runDirectorCritic({
    imageUrl,
    brief,
    clientName: ctx.clientName,
    plan: (ctx as unknown as { plan?: PlanoDePost }).plan,
    slideN,
  });
  return result as unknown as Record<string, unknown>;
}

async function stub(name: string): Promise<Record<string, unknown>> {
  await new Promise(r => setTimeout(r, 800));
  return { placeholder: true, phase: name };
}

async function dispatchPhase(
  phaseId:  PhaseId,
  input:    Record<string, unknown>,
  ctx:      ClientContext,
  uid:      string,
): Promise<Record<string, unknown>> {
  switch (phaseId) {
    case "briefing":   return { ...input };
    case "plano":      return executePlano(input, ctx);
    case "memoria":    return executeMemoria(input, ctx);
    case "compilacao": return stub("compilacao");
    case "prompt":     return stub("prompt");
    case "image":      return executeImage(input, ctx);
    case "copy":       return executeCopy(input, ctx, uid);
    case "critico":    return executeCritic(input, ctx);
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
    return NextResponse.json({ error: "clientId e phaseId obrigatórios", code: "MISSING_PARAMS" }, { status: 400 });
  }

  const uid = user.uid;
  const startedAt = Date.now();

  const ctx = await loadClientContext(uid, clientId);
  if (!ctx) {
    return NextResponse.json({ error: "client_not_found", code: "NOT_FOUND" }, { status: 404 });
  }

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

  let output: Record<string, unknown>;
  let errorMessage: string | undefined;
  const finishedAt = Date.now();

  try {
    output = await dispatchPhase(phaseId, input, ctx, uid);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    const errCode = (err as { code?: string }).code;
    const errDetails = (err as { details?: unknown }).details;
    console.error(`[canvas/phase/run] phaseId=${phaseId} error:`, err);
    await phaseRunRef.update({
      status: "error",
      errorMessage,
      finishedAt: Date.now(),
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: errorMessage, code: errCode ?? "PHASE_ERROR", details: errDetails },
      { status: 500 },
    );
  }

  await phaseRunRef.update({
    status: "done",
    output,
    finishedAt,
    latencyMs: finishedAt - startedAt,
  });

  return NextResponse.json({ phaseRunId, runId, output });
}
