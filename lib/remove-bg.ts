/**
 * lib/remove-bg.ts
 *
 * Background removal via Freepik's BG Remover API.
 * Uses the FREEPIK_API_KEY already configured — sem nova API key necessária.
 *
 * Fluxo:
 *   imageUrl → POST /v1/ai/bg-remover → task_id → polling → PNG transparente → R2
 */

import { removeBgFreepik } from "@/lib/freepik";
import { uploadToR2 } from "@/lib/r2";

export class RemoveBgError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "RemoveBgError";
  }
}

/**
 * Removes the background from an image URL using Freepik's BG Remover.
 * Uploads the resulting transparent PNG to R2 and returns its public URL.
 *
 * @param imageUrl - Public URL of the source image
 * @param r2Key    - Target key in R2 (e.g. "posts/{id}/transparent-{ts}.png")
 */
export async function removeBackground(
  imageUrl: string,
  r2Key:    string,
): Promise<string> {
  // result is either a public URL or base64 PNG returned by Freepik
  const result = await removeBgFreepik(imageUrl).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new RemoveBgError(msg);
  });

  // If Freepik returned a URL → download it, then upload to R2
  if (result.startsWith("http")) {
    const res = await fetch(result);
    if (!res.ok) throw new RemoveBgError(`Falha ao baixar PNG transparente: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    return uploadToR2(r2Key, buffer, "image/png");
  }

  // If Freepik returned base64 → strip data URI prefix if present
  const b64 = result.includes(",") ? result.split(",")[1] : result;
  const buffer = Buffer.from(b64, "base64");
  return uploadToR2(r2Key, buffer, "image/png");
}
