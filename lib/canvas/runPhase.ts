import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { runDirectorPlan } from "@/lib/director/plan";
import { runDirectorCopy } from "@/lib/director/copy";
import { runDirectorImage } from "@/lib/director/image";
import { runDirectorCritic } from "@/lib/director/critic";
import { compilePrompt } from "@/lib/compiler";
import { getActiveLockset } from "@/lib/lockset/server";
import { listLibraryAssets } from "@/lib/assets/service";
import type { PhaseId, PhaseRun, ClientContext, PlanoDePost, CompileInput } from "@/types";

// ── Format normalisation ───────────────────────────────────────────────────────

const FORMAT_MAP: Record<string, CompileInput["brief"]["format"]> = {
  feed:            "feed",
  ig_feed:         "feed",
  story:           "story",
  ig_story:        "story",
  reels:           "reels",
  ig_reels:        "reels",
  carousel:        "carousel",
  ig_carousel:     "carousel",
  li_carousel_pdf: "carousel",
  linkedin_post:   "linkedin_post",
};

function normalizeFormat(fmt: string): CompileInput["brief"]["format"] {
  return FORMAT_MAP[fmt] ?? "feed";
}

// ── Client context ─────────────────────────────────────────────────────────────

export async function loadClientContext(uid: string, clientId: string): Promise<ClientContext | null> {
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
      console.warn("[loadClientContext] Composite index missing — deploy firestore indexes");
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

// ── Phase executors ────────────────────────────────────────────────────────────

async function executePlano(
  input: Record<string, unknown>,
  ctx: ClientContext,
): Promise<Record<string, unknown>> {
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

async function executeMemoria(
  _input: Record<string, unknown>,
  ctx: ClientContext,
): Promise<Record<string, unknown>> {
  return { memory: ctx.clientMemory ?? null, clientId: ctx.clientId, clientName: ctx.clientName };
}

async function executeCompilacao(
  input: Record<string, unknown>,
  ctx: ClientContext,
  uid: string,
): Promise<Record<string, unknown>> {
  const formato = normalizeFormat((input.formato ?? "feed") as string);
  const objetivo = (input.objetivo ?? "") as string;
  const plan = input.plan as PlanoDePost | undefined;
  type CarouselCurrentSlide = NonNullable<CompileInput["carousel"]>["currentSlide"];
  const currentSlide = input.currentSlide as CarouselCurrentSlide;

  const [lockset, assets] = await Promise.all([
    getActiveLockset(uid, ctx.clientId),
    listLibraryAssets(uid, ctx.clientId, { includeInactive: false }),
  ]);

  const compileInput: CompileInput = {
    client: { id: ctx.clientId, name: ctx.clientName },
    dna: ctx.brandKit ?? ctx.dnaVisual,
    locks: lockset.locks,
    assets,
    brief: {
      objective: objetivo,
      format: formato,
      phase: "prompt",
      extra: plan ? { plan } : undefined,
    },
    ...(currentSlide ? { carousel: { slides: [], currentSlide } } : {}),
  };

  const output = compilePrompt(compileInput);
  return { compiledText: output.compiled, compiledWarnings: output.warnings.length };
}

async function executeCopy(
  input: Record<string, unknown>,
  ctx: ClientContext,
  uid: string,
): Promise<Record<string, unknown>> {
  const { objetivo, formato, plan } = input as { objetivo?: string; formato?: string; plan?: PlanoDePost };
  const result = await runDirectorCopy({
    uid,
    clientId:  ctx.clientId,
    objetivo:  objetivo ?? "",
    formato:   formato  ?? "feed",
    plan,
  });
  return result as unknown as Record<string, unknown>;
}

async function executeImage(
  input: Record<string, unknown>,
  ctx: ClientContext,
): Promise<Record<string, unknown>> {
  const { compiledText, formato, model, slideN } = input as {
    compiledText?: string;
    formato?: string;
    model?: string;
    slideN?: number;
  };
  const { imageUrl } = await runDirectorImage({
    clientId:        ctx.clientId,
    promptCompilado: compiledText ?? "",
    formato:         formato ?? "feed",
    model:           model as Parameters<typeof runDirectorImage>[0]["model"],
    slideN,
  });
  return { imageUrl };
}

async function executeCritic(
  input: Record<string, unknown>,
  ctx: ClientContext,
): Promise<Record<string, unknown>> {
  const { imageUrl, brief, slideN } = input as { imageUrl?: string; brief?: string; slideN?: number };
  if (!imageUrl) throw Object.assign(new Error("imageUrl ausente para fase critico"), { code: "MISSING_INPUT" });
  if (!brief)    throw Object.assign(new Error("brief ausente para fase critico"),    { code: "MISSING_INPUT" });
  const result = await runDirectorCritic({
    imageUrl,
    brief,
    clientName: ctx.clientName,
    plan:       input.plan as PlanoDePost | undefined,
    slideN,
  });
  return result as unknown as Record<string, unknown>;
}

async function dispatchPhase(
  phaseId: PhaseId,
  input:   Record<string, unknown>,
  ctx:     ClientContext,
  uid:     string,
): Promise<Record<string, unknown>> {
  switch (phaseId) {
    case "briefing":   return { ...input };
    case "plano":      return executePlano(input, ctx);
    case "memoria":    return executeMemoria(input, ctx);
    case "compilacao": return executeCompilacao(input, ctx, uid);
    case "prompt":     return { compiledText: input.compiledText ?? "", formato: input.formato ?? "feed" };
    case "image":      return executeImage(input, ctx);
    case "copy":       return executeCopy(input, ctx, uid);
    case "critico":    return executeCritic(input, ctx);
    case "output":     return { ...input };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RunPhaseParams {
  uid:         string;
  clientId:    string;
  phaseId:     PhaseId;
  input:       Record<string, unknown>;
  triggeredBy: PhaseRun["triggeredBy"];
  runId:       string;
}

export interface RunPhaseResult {
  output:     Record<string, unknown>;
  phaseRunId: string;
}

/**
 * Executes a single phase and logs a PhaseRun to Firestore.
 * Caller must supply a pre-loaded ClientContext (e.g. from the orchestrator loop).
 */
export async function runPhaseWithCtx(
  params: RunPhaseParams & { ctx: ClientContext },
): Promise<RunPhaseResult> {
  const { uid, clientId, phaseId, input, triggeredBy, runId, ctx } = params;
  const startedAt = Date.now();

  const phaseRunRef = adminDb.collection(paths.phaseRuns(uid, clientId, runId)).doc();
  await phaseRunRef.set({
    id:          phaseRunRef.id,
    clientId,
    phaseId,
    status:      "running" as const,
    inputHash:   "",
    input,
    startedAt,
    triggeredBy,
  } satisfies Omit<PhaseRun, "id"> & { id: string });

  let output: Record<string, unknown>;
  try {
    output = await dispatchPhase(phaseId, input, ctx, uid);
  } catch (err) {
    await phaseRunRef.update({
      status:       "error",
      errorMessage: String(err),
      finishedAt:   Date.now(),
      latencyMs:    Date.now() - startedAt,
    });
    throw err;
  }

  const finishedAt = Date.now();
  await phaseRunRef.update({
    status:    "done",
    output,
    finishedAt,
    latencyMs: finishedAt - startedAt,
  });

  return { output, phaseRunId: phaseRunRef.id };
}

/**
 * Convenience wrapper used by the HTTP phase/run route.
 * Loads ClientContext internally before dispatching.
 */
export async function runPhase(params: RunPhaseParams): Promise<RunPhaseResult> {
  const ctx = await loadClientContext(params.uid, params.clientId);
  if (!ctx) throw Object.assign(new Error("client_not_found"), { code: "NOT_FOUND" });
  return runPhaseWithCtx({ ...params, ctx });
}
