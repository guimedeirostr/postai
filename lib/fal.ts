/**
 * lib/fal.ts
 *
 * FAL.ai Flux Pro Ultra — premium synchronous image generation.
 *
 * Usage (env vars):
 *   IMAGE_PROVIDER=fal           → activate FAL.ai instead of Freepik
 *   IMAGE_QUALITY=ultra|standard|fast  → select model tier (default: ultra)
 *   FALAI_API_KEY=Key_xxx        → API key from fal.ai dashboard
 *
 * Pricing (approx):
 *   ultra    → fal-ai/flux-pro/v1.1-ultra   $0.06/image
 *   standard → fal-ai/flux-pro/v1.1         $0.04/image
 *   fast     → fal-ai/flux/schnell          $0.003/image
 */

import { uploadToR2 } from "./r2";

// ── Error class ─────────────────────────────────────────────────────────────

export class FalError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "FalError";
  }
}

// ── Provider flag ────────────────────────────────────────────────────────────

export function isFalEnabled(): boolean {
  return process.env.IMAGE_PROVIDER === "fal";
}

// ── Model selection ──────────────────────────────────────────────────────────

const FAL_MODELS: Record<string, string> = {
  ultra:    "fal-ai/flux-pro/v1.1-ultra",   // Best quality — $0.06/img
  standard: "fal-ai/flux-pro/v1.1",          // Good quality — $0.04/img
  fast:     "fal-ai/flux/schnell",            // Fast & cheap — $0.003/img
};

export function resolveFalModel(): string {
  const quality = process.env.IMAGE_QUALITY ?? "ultra";
  return FAL_MODELS[quality] ?? FAL_MODELS.ultra;
}

// ── Aspect ratios ────────────────────────────────────────────────────────────
// FAL.ai supports: "21:9"|"16:9"|"4:3"|"3:2"|"1:1"|"2:3"|"3:4"|"9:16"|"9:21"

const ASPECT_RATIO: Record<string, string> = {
  feed:        "3:4",   // Instagram feed 4:5 ≈ 3:4
  stories:     "9:16",  // Exact match
  reels_cover: "9:16",  // Exact match
};

// ── Main generation function ─────────────────────────────────────────────────

export async function generateImageFal(opts: {
  prompt:  string;
  format:  "feed" | "stories" | "reels_cover";
  post_id: string;
  model?:  string;
}): Promise<string> {
  const apiKey = process.env.FALAI_API_KEY;
  if (!apiKey) throw new FalError("FALAI_API_KEY não configurada");

  const model        = opts.model ?? resolveFalModel();
  const aspect_ratio = ASPECT_RATIO[opts.format] ?? "3:4";

  // ── Call FAL.ai sync endpoint ─────────────────────────────────────────────
  const response = await fetch(`https://fal.run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      prompt:                 opts.prompt,
      aspect_ratio,
      num_images:             1,
      output_format:          "jpeg",
      sync_mode:              true,          // Wait for result (no polling)
      enable_safety_checker:  false,         // We control our own prompts
      num_inference_steps:    28,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new FalError(
      `FAL.ai ${response.status}: ${errorText.slice(0, 300)}`,
      response.status
    );
  }

  const data = await response.json() as {
    images?: Array<{ url: string; width: number; height: number }>;
    image?:  { url: string };
  };

  const remoteUrl = data.images?.[0]?.url ?? data.image?.url;
  if (!remoteUrl) {
    throw new FalError("FAL.ai não retornou URL de imagem na resposta");
  }

  // ── Download generated image and store in R2 ──────────────────────────────
  const imageResp = await fetch(remoteUrl);
  if (!imageResp.ok) {
    throw new FalError(`Falha ao baixar imagem gerada pelo FAL.ai: ${imageResp.status}`);
  }

  const buffer = Buffer.from(await imageResp.arrayBuffer());
  const key    = `posts/${opts.post_id}/fal-raw.jpg`;
  return uploadToR2(key, buffer, "image/jpeg");
}
