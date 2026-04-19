// Queries reutilizáveis para a árvore V3
// Usa Firebase Admin SDK (server-side)

import { adminDb } from "@/lib/firebase-admin";
import { paths } from "./paths";
import type { Flow, PostV3, Asset, GenerationJob, BrandKit, ClientMemory } from "@/types";

// ── Flows ─────────────────────────────────────────────────────────────────────

export async function getFlow(uid: string, cid: string, fid: string): Promise<Flow | null> {
  const snap = await adminDb.doc(paths.flow(uid, cid, fid)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Flow;
}

export async function listFlows(uid: string, cid: string): Promise<Flow[]> {
  const snap = await adminDb.collection(paths.flows(uid, cid))
    .orderBy("updatedAt", "desc").limit(50).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Flow);
}

export async function upsertFlow(uid: string, cid: string, fid: string, data: Partial<Flow>) {
  await adminDb.doc(paths.flow(uid, cid, fid)).set(
    { ...data, updatedAt: new Date() },
    { merge: true }
  );
}

// ── Posts V3 ──────────────────────────────────────────────────────────────────

export async function getPostV3(uid: string, cid: string, pid: string): Promise<PostV3 | null> {
  const snap = await adminDb.doc(paths.post(uid, cid, pid)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as PostV3;
}

export async function listPostsV3(uid: string, cid: string): Promise<PostV3[]> {
  const snap = await adminDb.collection(paths.posts(uid, cid))
    .orderBy("createdAt", "desc").limit(50).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PostV3);
}

// ── Assets ────────────────────────────────────────────────────────────────────

export async function listAssets(uid: string, cid: string): Promise<Asset[]> {
  const snap = await adminDb.collection(paths.assets(uid, cid))
    .orderBy("createdAt", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Asset);
}

export async function getAssetBySlug(uid: string, cid: string, slug: string): Promise<Asset | null> {
  const snap = await adminDb.collection(paths.assets(uid, cid))
    .where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Asset;
}

// ── Brand Kit ─────────────────────────────────────────────────────────────────

export async function getBrandKit(uid: string, cid: string): Promise<BrandKit | null> {
  const snap = await adminDb.doc(paths.brandKit(uid, cid)).get();
  if (!snap.exists) return null;
  return snap.data() as BrandKit;
}

// ── Client Memory ─────────────────────────────────────────────────────────────

export async function getClientMemory(uid: string, cid: string): Promise<ClientMemory | null> {
  const snap = await adminDb.doc(paths.memory(uid, cid)).get();
  if (!snap.exists) return null;
  return snap.data() as ClientMemory;
}

// ── Generation Jobs ───────────────────────────────────────────────────────────

export async function listQueuedJobs(uid: string, cid: string, limit = 10): Promise<GenerationJob[]> {
  const snap = await adminDb.collection(paths.jobs(uid, cid))
    .where("status", "==", "queued")
    .orderBy("createdAt", "asc")
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GenerationJob);
}
