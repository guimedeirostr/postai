// lib/ai/memory.ts
// Gerencia ClientMemory no Firestore + busca por similaridade cosseno (sem dep. externa)

import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { ClientMemory, PostExample, RejectedPattern, AssetEmbedding } from "@/types";

const MAX_TONE_EXAMPLES = 50;

// ── Leitura ───────────────────────────────────────────────────────────────────

export async function loadClientMemory(uid: string, cid: string): Promise<ClientMemory> {
  const snap = await adminDb.doc(paths.memory(uid, cid)).get();
  if (!snap.exists) {
    return {
      toneExamples:     [],
      rejectedPatterns: [],
      personas:         [],
      productCatalog:   [],
      stats: { approved: 0, rejected: 0, avgCriticScore: 0 },
      updatedAt: null as unknown as ClientMemory["updatedAt"],
    };
  }
  return snap.data() as ClientMemory;
}

// ── Aprovação: aprende com o post ─────────────────────────────────────────────

export async function appendApproved(uid: string, cid: string, copy: string, criticScore?: number) {
  const ref  = adminDb.doc(paths.memory(uid, cid));
  const snap = await ref.get();
  const mem  = snap.exists ? (snap.data() as ClientMemory) : null;

  const currentExamples = mem?.toneExamples ?? [];
  const currentStats    = mem?.stats ?? { approved: 0, rejected: 0, avgCriticScore: 0 };

  // FIFO: mantém os últimos MAX_TONE_EXAMPLES
  const newExamples = [...currentExamples, copy].slice(-MAX_TONE_EXAMPLES);

  const newApproved = currentStats.approved + 1;
  const newAvgScore = criticScore != null
    ? (currentStats.avgCriticScore * currentStats.approved + criticScore) / newApproved
    : currentStats.avgCriticScore;

  await ref.set({
    toneExamples: newExamples,
    stats: {
      approved:       newApproved,
      rejected:       currentStats.rejected,
      avgCriticScore: Math.round(newAvgScore * 10) / 10,
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ── Reprovação: aprende padrões ruins ─────────────────────────────────────────

export async function appendRejected(uid: string, cid: string, pattern: string, reason: string) {
  const ref = adminDb.doc(paths.memory(uid, cid));

  const entry: Omit<RejectedPattern, "at"> & { at: ReturnType<typeof FieldValue.serverTimestamp> } = {
    pattern,
    reason,
    at: FieldValue.serverTimestamp(),
  };

  await ref.set({
    rejectedPatterns: FieldValue.arrayUnion(entry),
    stats: { rejected: FieldValue.increment(1) },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

// ── Busca vetorial por similaridade cosseno ───────────────────────────────────
// Para < 10k assets por cliente: carrega tudo em memória, calcula cosseno.
// Suficiente para produção inicial. Ver roadmap §3.5 para evolução futura.

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function searchSimilar(
  uid: string,
  cid: string,
  queryEmbedding: number[],
  topK = 5,
): Promise<Array<{ assetId: string; score: number }>> {
  const snap = await adminDb.collection(paths.embeddings(uid, cid)).get();
  if (snap.empty) return [];

  const scored = snap.docs
    .map(d => {
      const data = d.data() as AssetEmbedding;
      return { assetId: data.assetId, score: cosineSimilarity(queryEmbedding, data.embedding) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

// ── Geração de embedding via OpenAI ──────────────────────────────────────────

export async function createEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text, model: "text-embedding-3-small" }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings error: ${res.statusText}`);
  const data = await res.json() as { data: [{ embedding: number[] }] };
  return data.data[0].embedding;
}

export async function saveEmbedding(uid: string, cid: string, assetId: string, embedding: number[]) {
  await adminDb.doc(paths.embedding(uid, cid, assetId)).set({
    assetId,
    embedding,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ── Importação: adiciona PostExample rico à memória ────────────────────────────

export async function appendImported(uid: string, cid: string, example: PostExample) {
  const ref  = adminDb.doc(paths.memory(uid, cid));
  const snap = await ref.get();
  const mem  = snap.exists ? (snap.data() as ClientMemory) : null;

  const currentExamples = mem?.examples ?? [];
  const currentTones    = mem?.toneExamples ?? [];
  const currentStats    = mem?.stats ?? { approved: 0, rejected: 0, avgCriticScore: 0 };

  // Keep last 100 examples (FIFO)
  const newExamples = [...currentExamples, example].slice(-100);
  // Also keep caption in toneExamples for backward compat
  const newTones    = [...currentTones, example.caption].slice(-MAX_TONE_EXAMPLES);
  const imported    = (currentStats as { imported?: number }).imported ?? 0;

  await ref.set({
    examples:     newExamples,
    toneExamples: newTones,
    stats: { ...currentStats, imported: imported + 1 },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
