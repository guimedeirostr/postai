// lib/jobs/queue.ts
// Fila de geração via Firestore. Sem Redis — status em generationJobs/{jobId}.

import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import { getAssetBySlug } from "@/lib/firestore/queries";
import type { GenerationJob } from "@/types";

// ── Enfileirar novo job ───────────────────────────────────────────────────────

export interface EnqueueParams {
  nodeId:      string;
  model:       string;    // "flux-pro" | "flux-schnell" | "ideogram-3"
  prompt:      string;    // pode conter @slug
  costCredits: number;
  postId?:     string;
  slideId?:    string;
  format?:     string;    // "feed" | "carousel" | "story" | "reels-cover"
}

export async function enqueueJob(
  uid:      string,
  clientId: string,
  params:   EnqueueParams,
): Promise<string> {
  const ref = adminDb.collection(paths.jobs(uid, clientId)).doc();

  await ref.set({
    clientId,
    nodeId:      params.nodeId,
    model:       params.model,
    prompt:      params.prompt,
    refs:        [],
    status:      "queued",
    costCredits: params.costCredits,
    postId:      params.postId   ?? null,
    slideId:     params.slideId  ?? null,
    format:      params.format   ?? "feed",
    output:      null,
    error:       null,
    attempts:    0,
    createdAt:   FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
  });

  return ref.id;
}

// ── Resolver @slug → URL ──────────────────────────────────────────────────────

export async function resolveSlugRefs(
  uid:      string,
  clientId: string,
  prompt:   string,
): Promise<{ resolvedPrompt: string; refs: string[] }> {
  const slugPattern = /@(\w+)/g;
  const matches     = [...prompt.matchAll(slugPattern)];

  if (matches.length === 0) return { resolvedPrompt: prompt, refs: [] };

  const refs: string[] = [];
  let   resolved       = prompt;

  for (const match of matches) {
    const slug  = `@${match[1]}`;
    const asset = await getAssetBySlug(uid, clientId, slug);
    if (asset) {
      refs.push(asset.url);
      resolved = resolved.replace(slug, "");
    }
  }

  return { resolvedPrompt: resolved.trim(), refs };
}

// ── Marcar job como running (transação atômica) ───────────────────────────────

export async function claimJob(
  uid:      string,
  clientId: string,
  jobId:    string,
): Promise<GenerationJob | null> {
  const ref    = adminDb.doc(paths.job(uid, clientId, jobId));
  let   result: GenerationJob | null = null;

  await adminDb.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const job = snap.data() as GenerationJob;
    if (job.status !== "queued") return;

    tx.update(ref, {
      status:    "running",
      updatedAt: FieldValue.serverTimestamp(),
    });
    result = { ...job, id: snap.id, status: "running" };
  });

  return result;
}

// ── Marcar job como succeeded ─────────────────────────────────────────────────

export async function succeedJob(
  uid:      string,
  clientId: string,
  jobId:    string,
  output:   { assetId: string; url: string },
) {
  await adminDb.doc(paths.job(uid, clientId, jobId)).update({
    status:    "succeeded",
    output,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ── Marcar job como failed ────────────────────────────────────────────────────

export async function failJob(
  uid:      string,
  clientId: string,
  jobId:    string,
  error:    string,
  attempts: number,
) {
  await adminDb.doc(paths.job(uid, clientId, jobId)).update({
    status:    "failed",
    error,
    attempts,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
