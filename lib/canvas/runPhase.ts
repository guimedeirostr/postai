import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { paths } from "@/lib/firestore/paths";
import { runDirectorPlan } from "@/lib/director/plan";
import { runDirectorCopy } from "@/lib/director/copy";
import { runDirectorImage } from "@/lib/director/image";
import { runDirectorCritic } from "@/lib/director/critic";
import { compilePrompt } from "@/lib/compiler";
import { getActiveLockset } from "@/lib/lockset/server";
import { listLibraryAssets } from "@/lib/assets/service";
import type { PhaseId, PhaseRun, ClientContext, PlanoDePost, CompileInput, SlideType, SlideBgStyle, TraceEntry, TraceEmitter } from "@/types";

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

const CAROUSEL_FORMATS = new Set(["carousel", "ig_carousel", "li_carousel_pdf"]);

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
  _emit?: TraceEmitter,
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
  _emit?: TraceEmitter,
): Promise<Record<string, unknown>> {
  return { memory: ctx.clientMemory ?? null, clientId: ctx.clientId, clientName: ctx.clientName };
}

async function executeCompilacao(
  input: Record<string, unknown>,
  ctx: ClientContext,
  uid: string,
  _emit?: TraceEmitter,
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
  emit?: TraceEmitter,
): Promise<Record<string, unknown>> {
  const { objetivo, formato, plan } = input as { objetivo?: string; formato?: string; plan?: PlanoDePost };
  const result = await runDirectorCopy({
    uid,
    clientId:  ctx.clientId,
    objetivo:  objetivo ?? "",
    formato:   formato  ?? "feed",
    plan,
    emit,
  });
  return result as unknown as Record<string, unknown>;
}

async function executeImage(
  input: Record<string, unknown>,
  ctx: ClientContext,
  emit?: TraceEmitter,
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
    emit,
  });
  return { imageUrl };
}

async function executeCritic(
  input: Record<string, unknown>,
  ctx: ClientContext,
  emit?: TraceEmitter,
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
    emit,
  });
  return result as unknown as Record<string, unknown>;
}

// ── Output — persists the pipeline result to Firestore ─────────────────────────

type SlideResult = {
  n: number; role: string; headline: string; body: string;
  cta?: string | null; imageUrl?: string | null; score?: number | null; notes?: string | null;
};

function roleToSlideType(role: string): SlideType {
  if (role === "hook" || role === "capa") return "hook";
  if (role === "cta" || role === "fechamento" || role === "close") return "cta";
  return "content";
}

async function executeOutput(
  input: Record<string, unknown>,
  ctx: ClientContext,
  uid: string,
  meta: { runId: string; flowId?: string },
  _emit?: TraceEmitter,
): Promise<Record<string, unknown>> {
  const formato   = (input.formato as string) ?? "feed";
  const { runId, flowId } = meta;
  const slides    = (input.slideResults as SlideResult[] | undefined) ?? [];

  console.log("[output] start", {
    uid, clientId: ctx.clientId, formato, flowId: flowId ?? null, runId,
    slidesCount: slides.length,
    hasSlideResults: "slideResults" in input,
    inputKeys: Object.keys(input),
  });

  if (CAROUSEL_FORMATS.has(formato)) {
    const docRef  = adminDb.collection(paths.carousels(uid, ctx.clientId)).doc();
    const docPath = `users/${uid}/clients/${ctx.clientId}/carousels/${docRef.id}`;

    // ── V3 canvas doc ────────────────────────────────────────────────────────
    const v3Doc = {
      id:         docRef.id,
      uid,
      clientId:   ctx.clientId,
      clientName: ctx.clientName,
      objetivo:   (input.objetivo  as string) ?? "",
      formato,
      caption:    (input.caption   as string) ?? "",
      cta:        (input.cta       as string) ?? "",
      plan:       input.plan ?? null,
      slides:     slides.map(s => ({
        n:        s.n,
        role:     s.role,
        headline: s.headline,
        body:     s.body,
        cta:      s.cta      ?? null,
        imageUrl: s.imageUrl ?? null,
        score:    s.score    ?? null,
        notes:    s.notes    ?? null,
      })),
      status:     "ready" as const,
      runId,
      flowId:     flowId ?? null,
      createdAt:  FieldValue.serverTimestamp(),
    };

    // ── Flat `carousels` doc (V1/V2 shape — gallery-compatible) ─────────────
    const flatSlides = slides.map(s => ({
      index:        s.n - 1,
      type:         roleToSlideType(s.role),
      headline:     s.headline,
      body_text:    s.body || undefined,
      cta_text:     s.cta  || undefined,
      composed_url: s.imageUrl ?? null,
      bg_style:     "brand" as SlideBgStyle,
    }));
    const objetivo  = (input.objetivo as string) ?? "";
    const hookImage = slides.find(s => s.n === 1)?.imageUrl ?? null;
    const flatDoc = {
      id:                docRef.id,   // same ID as V3 doc
      agency_id:         uid,
      client_id:         ctx.clientId,
      client_name:       ctx.clientName,
      theme:             objetivo,
      objective:         objetivo,
      topic:             objetivo,
      caption:           (input.caption  as string) ?? "",
      hashtags:          (input.hashtags as string[]) ?? [],
      slides:            flatSlides,
      slide_count:       slides.length,
      hook_task_id:      null,
      hook_image_url:    hookImage,
      image_provider:    "canvas",
      is_panoramic:      false,
      dna_reference_url: null,
      status:            "ready" as const,
      runId,
      flowId:            flowId ?? null,
      created_at:        FieldValue.serverTimestamp(),
      updated_at:        FieldValue.serverTimestamp(),
    };

    console.log("[output] saving carousel", {
      docPath,
      slidesCount: slides.length,
      hookImage,
      payloadKeys: Object.keys(flatDoc),
      status: flatDoc.status,
    });

    try {
      await Promise.all([
        docRef.set(v3Doc),
        adminDb.collection("carousels").doc(docRef.id).set(flatDoc),
      ]);
    } catch (err) {
      console.error("[output] save FAILED (carousel)", {
        err: (err as Error).message,
        stack: (err as Error).stack,
        docPath, flowId: flowId ?? null, runId,
      });
      throw err;
    }

    console.log("[output] saved carousel", { carouselId: docRef.id, docPath, flatPath: `carousels/${docRef.id}` });
    return { ...input, carouselId: docRef.id, slidesCount: slides.length, persisted: true };
  }

  // Single-post formats
  const docRef  = adminDb.collection(paths.posts(uid, ctx.clientId)).doc();
  const docPath = `users/${uid}/clients/${ctx.clientId}/posts/${docRef.id}`;
  console.log("[output] saving post", { docPath });

  const doc = {
    id:         docRef.id,
    uid,
    clientId:   ctx.clientId,
    clientName: ctx.clientName,
    objetivo:   (input.objetivo  as string) ?? "",
    formato,
    headline:   (input.headline  as string) ?? "",
    caption:    (input.caption   as string) ?? "",
    cta:        (input.cta       as string) ?? "",
    hashtags:   (input.hashtags  as string[]) ?? [],
    imageUrl:   (input.imageUrl  as string) ?? null,
    score:      (input.score     as number) ?? null,
    notes:      (input.notes     as string) ?? null,
    plan:       input.plan ?? null,
    status:     "ready" as const,
    runId,
    flowId:     flowId ?? null,
    createdAt:  FieldValue.serverTimestamp(),
  };

  try {
    await docRef.set(doc);
  } catch (err) {
    console.error("[output] save FAILED (post)", {
      err: (err as Error).message,
      stack: (err as Error).stack,
      docPath, flowId: flowId ?? null, runId,
    });
    throw err;
  }

  console.log("[output] saved post", { postId: docRef.id, docPath });
  return { ...input, postId: docRef.id, persisted: true };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

async function dispatchPhase(
  phaseId: PhaseId,
  input:   Record<string, unknown>,
  ctx:     ClientContext,
  uid:     string,
  meta:    { runId: string; flowId?: string },
  emit?:   TraceEmitter,
): Promise<Record<string, unknown>> {
  switch (phaseId) {
    case "briefing":   return { ...input };
    case "plano":      return executePlano(input, ctx, emit);
    case "memoria":    return executeMemoria(input, ctx, emit);
    case "compilacao": return executeCompilacao(input, ctx, uid, emit);
    case "prompt":     return { compiledText: input.compiledText ?? "", formato: input.formato ?? "feed" };
    case "image":      return executeImage(input, ctx, emit);
    case "copy":       return executeCopy(input, ctx, uid, emit);
    case "critico":    return executeCritic(input, ctx, emit);
    case "output":     return executeOutput(input, ctx, uid, meta, emit);
  }
}

// ── buildInput — threads accumulated outputs into a phase-specific input ──────

export function buildInput(
  phaseId: PhaseId,
  accum:   Record<string, unknown>,
  extra?:  Record<string, unknown>,
): Record<string, unknown> {
  const base = { objetivo: accum.objetivo, formato: accum.formato };
  switch (phaseId) {
    case "briefing":   return base;
    case "memoria":    return base;
    case "plano":      return base;
    case "compilacao": return { ...base, plan: accum.plan, ...(extra ?? {}) };
    case "prompt":     return { compiledText: accum.compiledText, ...base };
    case "image":      return { compiledText: accum.compiledText, formato: accum.formato, model: accum.model, slideN: accum.slideN };
    case "copy":       return { ...base, plan: accum.plan };
    case "critico":    return { imageUrl: accum.imageUrl, brief: accum.brief ?? accum.caption ?? accum.headline, slideN: accum.slideN, plan: accum.plan };
    case "output":     return { ...accum };
    default:           return base;
  }
}

/** Loads all done phaseRuns for a run and merges their outputs into a flat accum object. */
export async function loadUpstreamOutputs(
  uid:      string,
  clientId: string,
  runId:    string,
): Promise<Record<string, unknown>> {
  const snap = await adminDb.collection(paths.phaseRuns(uid, clientId, runId)).get();
  const accum: Record<string, unknown> = {};
  const doneDocs = snap.docs
    .map(d => d.data())
    .filter(d => d.status === "done")
    .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  for (const doc of doneDocs) {
    if (doc.output && typeof doc.output === "object") Object.assign(accum, doc.output);
  }
  return accum;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface RunPhaseParams {
  uid:         string;
  clientId:    string;
  phaseId:     PhaseId;
  input:       Record<string, unknown>;
  triggeredBy: PhaseRun["triggeredBy"];
  runId:       string;
  flowId?:     string;
  emit?:       TraceEmitter;
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
  const { uid, clientId, phaseId, input, triggeredBy, runId, flowId, ctx, emit } = params;
  const startedAt = Date.now();

  const traceLog: TraceEntry[] = [];
  const innerEmit: TraceEmitter = (entry) => {
    traceLog.push(entry);
    emit?.(entry);
  };

  innerEmit({ ts: startedAt, level: "info", code: "start",
    message: `${phaseId} iniciada`,
    meta: { phaseId, inputKeys: Object.keys(input) } });

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
    output = await dispatchPhase(phaseId, input, ctx, uid, { runId, flowId }, innerEmit);
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
  innerEmit({ ts: finishedAt, level: "info", code: "done",
    message: `${phaseId} concluída · ${finishedAt - startedAt}ms`,
    meta: { latencyMs: finishedAt - startedAt } });

  await phaseRunRef.update({
    status:    "done",
    output,
    finishedAt,
    latencyMs: finishedAt - startedAt,
    traces:    traceLog,
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
