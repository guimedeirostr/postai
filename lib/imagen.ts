/**
 * lib/imagen.ts
 *
 * Google Imagen 4 client for PostAI.
 * Uses the Generative Language REST API directly — no SDK dependency.
 *
 * Flow:
 *   generateImage(prompt, format, post_id) →
 *     POST generativelanguage.googleapis.com/v1beta/models/{model}:predict →
 *     base64 PNG/JPEG →
 *     upload to R2 →
 *     returns public URL
 *
 * Aspect ratio mapping (Imagen 4 doesn't support 4:5):
 *   feed        → 3:4   (closest to Instagram 4:5 — 1080×1440 vs 1080×1350)
 *   stories     → 9:16  (exact match — 1080×1920)
 *   reels_cover → 9:16  (exact match — 1080×1920)
 */

import { uploadToR2 } from "@/lib/r2";

// ─── Model constants ───────────────────────────────────────────────────────────

export const IMAGEN_MODELS = {
  fast:     "imagen-4.0-fast-generate-001",     // $0.02 / image — high volume
  standard: "imagen-4.0-generate-001",           // $0.04 / image — production default
  ultra:    "imagen-4.0-ultra-generate-001",     // $0.06 / image — max quality
} as const;

export type ImagenModel = (typeof IMAGEN_MODELS)[keyof typeof IMAGEN_MODELS];

// ─── Aspect ratio mapping ──────────────────────────────────────────────────────

const FORMAT_ASPECT: Record<string, string> = {
  feed:               "3:4",   // Instagram feed 4:5 → closest supported is 3:4
  carousel:           "3:4",   // Instagram carousel 4:5 → same fallback as feed
  stories:            "9:16",  // Stories / Reels — exact
  reels_cover:        "9:16",
  linkedin_post:      "16:9",
  linkedin_carousel:  "1:1",
  linkedin_article:   "16:9",
};

// ─── Error class ───────────────────────────────────────────────────────────────

export class ImagenError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ImagenError";
  }
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface ImagenPrediction {
  bytesBase64Encoded: string;
  mimeType:           string;
}

interface ImagenResponse {
  predictions?: ImagenPrediction[];
  error?:       { message: string; code: number; status: string };
}

// ─── Core function ─────────────────────────────────────────────────────────────

/**
 * Generate one image with Imagen 4, upload to R2, return public URL.
 *
 * @param prompt   - Final visual prompt from Art Director (English, max 480 tokens)
 * @param format   - PostAI format: "feed" | "stories" | "reels_cover"
 * @param post_id  - Used as part of the R2 key
 * @param model    - Imagen model variant (default: standard)
 */
export async function generateImage({
  prompt,
  format,
  post_id,
  model = IMAGEN_MODELS.standard,
}: {
  prompt:   string;
  format:   "feed" | "stories" | "reels_cover";
  post_id:  string;
  model?:   ImagenModel;
}): Promise<string> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new ImagenError("GOOGLE_AI_API_KEY não configurada");

  const aspectRatio = FORMAT_ASPECT[format] ?? "3:4";

  // Imagen 4 max prompt = 480 tokens (~360 words). Trim safely.
  const safeprompt = prompt.slice(0, 1800);

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt: safeprompt }],
      parameters: {
        sampleCount:      1,
        aspectRatio,
        imageSize:        "1K",      // 1K = ~1024px on long edge
        personGeneration: "allow_adult",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ImagenResponse;
    const msg  = body.error?.message ?? `Imagen API HTTP ${res.status}`;
    throw new ImagenError(msg, res.status);
  }

  const data = await res.json() as ImagenResponse;

  if (!data.predictions?.length) {
    throw new ImagenError(
      "Imagen não retornou imagens — prompt pode ter sido filtrado por política de segurança"
    );
  }

  const { bytesBase64Encoded, mimeType } = data.predictions[0];
  const buffer   = Buffer.from(bytesBase64Encoded, "base64");
  const ext      = mimeType === "image/jpeg" ? "jpg" : "png";
  const r2Key    = `posts/${post_id}/imagen-${Date.now()}.${ext}`;

  const url = await uploadToR2(r2Key, buffer, mimeType);
  return url;
}

// ─── Provider detection helper ─────────────────────────────────────────────────

/**
 * Returns true when IMAGE_PROVIDER env var is set to "imagen4".
 * Use this to branch between Freepik (async/polling) and Imagen 4 (sync).
 */
export function isImagen4Enabled(): boolean {
  return process.env.IMAGE_PROVIDER === "imagen4";
}

/**
 * Returns the Imagen model to use based on IMAGE_QUALITY env var.
 *   IMAGE_QUALITY=fast    → imagen-4.0-fast-generate-001    ($0.02)
 *   IMAGE_QUALITY=ultra   → imagen-4.0-ultra-generate-001   ($0.06)
 *   (default)             → imagen-4.0-generate-001         ($0.04)
 */
export function resolveImagenModel(): ImagenModel {
  const q = process.env.IMAGE_QUALITY;
  if (q === "fast")  return IMAGEN_MODELS.fast;
  if (q === "ultra") return IMAGEN_MODELS.ultra;
  return IMAGEN_MODELS.standard;
}
