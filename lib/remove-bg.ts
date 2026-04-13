/**
 * lib/remove-bg.ts
 *
 * Background removal via remove.bg API.
 * Returns PNG with alpha channel (transparent background) uploaded to R2.
 *
 * API: https://www.remove.bg/api
 * Key: REMOVEBG_API_KEY env var
 * Free plan: 50 previews/month. Production: ~$0.10–0.25/image.
 */

import { uploadToR2 } from "@/lib/r2";

export class RemoveBgError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "RemoveBgError";
  }
}

/**
 * Removes the background from an image URL, uploads the result PNG to R2.
 * Returns the public R2 URL of the transparent PNG.
 *
 * @param imageUrl - Public URL of the source image
 * @param r2Key    - Target key in R2 (e.g. "posts/{id}/transparent-{ts}.png")
 */
export async function removeBackground(
  imageUrl: string,
  r2Key:    string,
): Promise<string> {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) throw new RemoveBgError("REMOVEBG_API_KEY não configurada");

  const form = new FormData();
  form.append("image_url", imageUrl);
  form.append("size", "auto");    // auto = highest quality available on plan
  form.append("format", "png");   // always PNG for alpha channel

  const res = await fetch("https://api.remove.bg/v1.0/removebg", {
    method:  "POST",
    headers: { "X-Api-Key": apiKey },
    body:    form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const json = JSON.parse(text) as { errors?: Array<{ title: string }> };
      detail = json.errors?.[0]?.title ?? text;
    } catch { /* keep raw text */ }
    throw new RemoveBgError(`remove.bg HTTP ${res.status}: ${detail}`, res.status);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const url    = await uploadToR2(r2Key, buffer, "image/png");
  return url;
}
