import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { loadClientContext, runPhaseWithCtx } from "@/lib/canvas/runPhase";
import type { PhaseId, BriefingInput } from "@/types";

// Carousel pipelines can take several minutes (image gen ≤55 s/slide × N slides).
export const maxDuration = 300;

type RunBody = {
  clientId:     string;
  mode:         "step" | "checkpoint" | "run-all";
  checkpointAt?: PhaseId;
  briefing:     BriefingInput;
  flowId?:      string;
};

const CAROUSEL_FORMATS = new Set(["carousel", "ig_carousel", "li_carousel_pdf"]);

// ── Input builder — threads accumulated outputs to the next phase ──────────────

function buildInput(
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

function encode(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body: RunBody = await req.json();
  const { clientId, mode, checkpointAt, briefing, flowId } = body;

  if (!clientId) return new Response("clientId obrigatório", { status: 400 });

  const uid = user.uid;

  // Load client context once — reused across all phases in the run
  const ctxOrNull = await loadClientContext(uid, clientId);
  if (!ctxOrNull) return new Response("client_not_found", { status: 404 });
  const ctx = ctxOrNull; // non-null after the guard above

  // Create CanvasRun document
  const runRef = adminDb.collection(paths.canvasRuns(uid, clientId)).doc();
  const runId  = runRef.id;
  await runRef.set({
    id:               runId,
    clientId,
    briefingSnapshot: briefing,
    mode,
    checkpointAt:     checkpointAt ?? null,
    startedAt:        Date.now(),
    finalStatus:      "draft",
    createdBy:        uid,
  });

  const triggeredBy = (mode === "step" ? "step" : "run-all") as "step" | "run-all";
  const isCarousel  = CAROUSEL_FORMATS.has(briefing.formato ?? "feed");

  // Resolve or auto-create a stable flow doc before streaming begins
  let resolvedFlowId: string | undefined;
  if (flowId && !flowId.startsWith("new")) {
    resolvedFlowId = flowId;
  } else {
    try {
      const newFlowRef = adminDb.collection(paths.flows(uid, clientId)).doc();
      await newFlowRef.set({
        clientId,
        title:     briefing.objetivo ? briefing.objetivo.slice(0, 60) : `Run ${new Date().toISOString().slice(0, 10)}`,
        nodes:     [],
        edges:     [],
        createdBy: uid,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      resolvedFlowId = `${clientId}_${newFlowRef.id}`;
      console.log("[canvas/run] auto-created flow", { resolvedFlowId, runId });
    } catch (err) {
      console.error("[canvas/run] failed to auto-create flow", { err: (err as Error).message, runId });
      // Continue — output will persist with flowId: null
    }
  }

  const stream = new ReadableStream({
    async start(controller) {

      // Accumulated outputs shared across phases
      const accum: Record<string, unknown> = {
        objetivo: briefing.objetivo ?? "",
        formato:  briefing.formato  ?? "feed",
      };

      // First event — gives client the real flowId to rewrite the URL
      controller.enqueue(encode({ type: "run_started", flowId: resolvedFlowId ?? null, runId }));

      async function exec(phaseId: PhaseId, input: Record<string, unknown>, slideN?: number): Promise<boolean> {
        controller.enqueue(encode({ type: "phase_start", phaseId, slideN, runId }));
        const emit: import("@/types").TraceEmitter = (entry) =>
          controller.enqueue(encode({ type: "node_trace", phaseId, slideN: slideN ?? null, ...entry }));
        try {
          const result = await runPhaseWithCtx({ uid, clientId, phaseId, input, triggeredBy, runId, flowId: resolvedFlowId, ctx, emit });
          Object.assign(accum, result.output);
          controller.enqueue(encode({ type: "phase_done", phaseId, slideN, output: result.output, runId }));
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          controller.enqueue(encode({ type: "phase_error", phaseId, slideN, error: msg, runId }));
          return false; // signals caller to abort
        }
      }

      function hitCheckpoint(phaseId: PhaseId, slideN?: number): boolean {
        if (mode === "checkpoint" && checkpointAt && phaseId === checkpointAt) {
          controller.enqueue(encode({ type: "checkpoint_reached", phaseId, slideN, runId }));
          return true;
        }
        return false;
      }

      try {
        if (!isCarousel) {
          // ── Single-post pipeline ─────────────────────────────────────────────
          const phases: PhaseId[] = [
            "briefing", "memoria", "plano",
            "compilacao", "prompt",
            "image", "copy", "critico",
            "output",
          ];
          for (const phaseId of phases) {
            const ok = await exec(phaseId, buildInput(phaseId, accum));
            if (!ok) break;
            if (hitCheckpoint(phaseId)) break;
          }
        } else {
          // ── Carousel pipeline ────────────────────────────────────────────────
          // Phase 1: shared phases (copy first to get slide structure)
          const commonStart: PhaseId[] = ["briefing", "memoria", "plano", "copy"];
          let aborted = false;
          for (const phaseId of commonStart) {
            const ok = await exec(phaseId, buildInput(phaseId, accum));
            if (!ok) { aborted = true; break; }
            if (hitCheckpoint(phaseId)) { aborted = true; break; }
          }

          if (!aborted) {
            // Phase 2: per-slide (compilacao → prompt → image → critico)
            type Slide = { n: number; role: string; headline: string; body: string; cta?: string };
            const slides = (accum.slides as Slide[] | undefined) ?? [];
            // Fallback: single virtual slide if copy didn't return structure
            const slidesToRun: Slide[] = slides.length > 0
              ? slides
              : [{ n: 1, role: "hook", headline: (accum.headline as string) ?? "", body: (accum.caption as string) ?? "" }];

            const accumSlides: Array<{
              n: number; role: string; headline: string; body: string;
              cta?: string | null; imageUrl?: string | null; score?: number | null; notes?: string | null;
            }> = [];

            for (const slide of slidesToRun) {
              const slideN       = slide.n;
              const currentSlide = { index: slide.n - 1, role: slide.role, totalSlides: slidesToRun.length };

              // Reset slide-local outputs before each slide
              accum.slideN        = slideN;
              accum.brief         = slide.headline || (accum.caption as string | undefined) || "";
              accum.compiledText  = undefined;
              accum.imageUrl      = undefined;
              accum.score         = undefined;
              accum.notes         = undefined;

              const perSlide: PhaseId[] = ["compilacao", "prompt", "image", "critico"];
              let slideAborted = false;
              for (const phaseId of perSlide) {
                const extra = phaseId === "compilacao" ? { currentSlide } : undefined;
                const ok    = await exec(phaseId, buildInput(phaseId, accum, extra), slideN);
                if (!ok) { slideAborted = true; break; }
              }

              accumSlides.push({
                n:        slide.n,
                role:     slide.role,
                headline: slide.headline,
                body:     slide.body,
                cta:      slide.cta ?? null,
                imageUrl: (accum.imageUrl as string) ?? null,
                score:    (accum.score as number) ?? null,
                notes:    (accum.notes as string) ?? null,
              });

              if (slideAborted) { aborted = true; break; }
              if (hitCheckpoint("critico", slideN)) { aborted = true; break; }
            }

            if (!aborted) {
              accum.slideResults = accumSlides;
              await exec("output", buildInput("output", accum));
            }
          }
        }

        // Update flow document with latestRunId for hydration on next load
        if (resolvedFlowId) {
          try {
            const parts     = resolvedFlowId.split("_");
            const fClientId = parts[0];
            const fRealId   = parts.slice(1).join("_");
            if (fClientId && fRealId) {
              await adminDb.doc(paths.flow(uid, fClientId, fRealId)).update({ latestRunId: runId });
              console.log("[canvas/run] latestRunId updated", { resolvedFlowId, runId });
            }
          } catch (err) {
            console.error("[canvas/run] failed to update latestRunId", { err: (err as Error).message, resolvedFlowId, runId });
          }
        }

        controller.enqueue(encode({
          type:       "run_complete",
          flowId:     resolvedFlowId ?? null,
          runId,
          carouselId: (accum.carouselId as string) ?? null,
          postId:     (accum.postId    as string) ?? null,
        }));
      } catch (err) {
        console.error("[canvas/run] unhandled error in stream", { err: (err as Error).message });
        controller.enqueue(encode({ type: "run_complete", flowId: resolvedFlowId ?? null, runId, error: true }));
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
