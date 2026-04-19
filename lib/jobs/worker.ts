// lib/jobs/worker.ts
// Processa um GenerationJob: resolve @slugs, chama modelo de imagem, salva Asset.

import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import { resolveSlugRefs, succeedJob, failJob } from "./queue";
import type { GenerationJob } from "@/types";

const MAX_ATTEMPTS = 2;

// ── Aspect ratio helpers ──────────────────────────────────────────────────────

const ASPECT_BY_FORMAT: Record<string, string> = {
  feed:          "3:4",
  carousel:      "1:1",
  story:         "9:16",
  "reels-cover": "9:16",
};

// ── FAL.ai call ───────────────────────────────────────────────────────────────

async function callFal(
  model:  string,
  prompt: string,
  refs:   string[],
  format: string,
): Promise<string> {
  const falKey = process.env.FALAI_API_KEY;
  if (!falKey) throw new Error("FALAI_API_KEY não configurada");

  const falModel: Record<string, string> = {
    "flux-pro":     "fal-ai/flux-pro/v1.1-ultra",
    "flux-schnell": "fal-ai/flux/schnell",
    "ideogram-3":   "fal-ai/ideogram/v3",
  };

  const endpoint = falModel[model] ?? falModel["flux-pro"];
  const aspect   = ASPECT_BY_FORMAT[format] ?? "1:1";

  const body: Record<string, unknown> = {
    prompt,
    aspect_ratio:     aspect,
    num_images:       1,
    enable_safety_checker: false,
  };

  // IP-Adapter / reference images (Flux Ultra supports image_prompt_strength)
  if (refs.length > 0) {
    body.image_prompt_strength = 0.1;
    body.image_prompt          = refs[0];
  }

  const res = await fetch(`https://fal.run/${endpoint}`, {
    method:  "POST",
    headers: {
      Authorization:  `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`FAL.ai ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { images?: { url: string }[]; image?: { url: string } };
  const url  = data.images?.[0]?.url ?? data.image?.url;
  if (!url) throw new Error("FAL.ai não retornou URL de imagem");
  return url;
}

// ── Create Asset doc ──────────────────────────────────────────────────────────

async function createGeneratedAsset(
  uid:      string,
  clientId: string,
  url:      string,
  prompt:   string,
  model:    string,
): Promise<string> {
  // Auto-slug: @gen{N}
  const existingSnap = await adminDb
    .collection(paths.assets(uid, clientId))
    .where("kind", "==", "generated")
    .get();
  const n    = existingSnap.size + 1;
  const slug = `@gen${n}`;

  const ref = adminDb.collection(paths.assets(uid, clientId)).doc();
  await ref.set({
    clientId,
    kind:        "generated",
    url,
    storagePath: "",
    slug,
    prompt,
    model,
    expiresAt:   null,
    createdAt:   FieldValue.serverTimestamp(),
  });

  return ref.id;
}

// ── Main: process one job ─────────────────────────────────────────────────────

export async function processJob(
  uid:      string,
  clientId: string,
  job:      GenerationJob,
): Promise<void> {
  const attempts = (job.attempts ?? 0) + 1;

  try {
    // 1. Resolve @slug references in the prompt
    const { resolvedPrompt, refs } = await resolveSlugRefs(uid, clientId, job.prompt);
    const allRefs = [...(job.refs ?? []), ...refs];

    // 2. Call image model
    const format   = (job as GenerationJob & { format?: string }).format ?? "feed";
    const imageUrl = await callFal(job.model, resolvedPrompt, allRefs, format);

    // 3. Save asset in Firestore
    const assetId = await createGeneratedAsset(uid, clientId, imageUrl, resolvedPrompt, job.model);

    // 4. Mark job succeeded
    await succeedJob(uid, clientId, job.id, { assetId, url: imageUrl });

    // 5. Update slide if applicable
    const j = job as GenerationJob & { postId?: string; slideId?: string };
    if (j.postId && j.slideId) {
      await adminDb
        .doc(paths.slides(uid, clientId, j.postId) + `/${j.slideId}`)
        .set({ assetId, assetUrl: imageUrl, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    if (attempts >= MAX_ATTEMPTS) {
      await failJob(uid, clientId, job.id, message, attempts);
    } else {
      // Re-queue for retry
      await adminDb.doc(paths.job(uid, clientId, job.id)).update({
        status:    "queued",
        error:     message,
        attempts,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
}
