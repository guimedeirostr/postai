import { adminDb } from '@/lib/firebase-admin';
import { paths } from '@/lib/firestore/paths';
import type { LibraryAsset, AssetRole } from '@/types';
import type { AssetCreateData, AssetUpdateData } from './schema';
import { assetStoragePath } from './storage';
import { randomUUID } from 'crypto';

function col(uid: string, clientId: string) {
  return adminDb.collection(paths.libraryAssets(uid, clientId));
}

function doc(uid: string, clientId: string, assetId: string) {
  return adminDb.doc(paths.libraryAsset(uid, clientId, assetId));
}

export async function listLibraryAssets(
  uid: string,
  clientId: string,
  opts?: { role?: string; includeInactive?: boolean },
): Promise<LibraryAsset[]> {
  try {
    let q = col(uid, clientId).where('active', '==', true) as FirebaseFirestore.Query;
    if (opts?.includeInactive) q = col(uid, clientId) as FirebaseFirestore.Query;
    if (opts?.role) q = q.where('role', '==', opts.role);
    const snap = await q.get();
    const assets = snap.docs.map(d => ({ id: d.id, ...d.data() } as LibraryAsset));
    // Sort: preferred first, then role asc, then updatedAt desc
    return assets.sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  } catch {
    return [];
  }
}

export async function slugExists(uid: string, clientId: string, slug: string, excludeId?: string): Promise<boolean> {
  const snap = await col(uid, clientId).where('slug', '==', slug).limit(5).get();
  return snap.docs.some(d => d.id !== excludeId);
}

export async function createAsset(uid: string, clientId: string, data: AssetCreateData): Promise<LibraryAsset> {
  const id = randomUUID();
  const now = Date.now();
  const asset: LibraryAsset = {
    id,
    clientId,
    role:        data.role,
    slug:        data.slug,
    label:       data.label,
    description: data.description,
    storagePath: assetStoragePath(clientId, id, data.mimeType),
    downloadUrl: '',            // filled in after finalize
    mimeType:    data.mimeType,
    bytes:       data.bytes,
    width:       data.width,
    height:      data.height,
    preferred:   false,
    active:      true,
    createdAt:   now,
    updatedAt:   now,
    createdBy:   uid,
  };
  await doc(uid, clientId, id).set(asset);
  return asset;
}

export async function finalizeAsset(uid: string, clientId: string, assetId: string, downloadUrl: string): Promise<LibraryAsset> {
  const ref = doc(uid, clientId, assetId);
  await ref.update({ downloadUrl, updatedAt: Date.now() });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() } as LibraryAsset;
}

export async function updateAsset(
  uid: string,
  clientId: string,
  assetId: string,
  data: AssetUpdateData,
): Promise<LibraryAsset> {
  const ref = doc(uid, clientId, assetId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Asset not found');

  const update: Partial<LibraryAsset> = { ...data, updatedAt: Date.now() };

  // preferred=true → unset others in same role via batch
  if (data.preferred === true) {
    const current = snap.data() as LibraryAsset;
    const role = data.role ?? current.role;
    await setPreferredBatch(uid, clientId, assetId, role, adminDb.batch());
    delete update.preferred; // handled by batch
    const batch2 = adminDb.batch();
    batch2.update(ref, { ...update, preferred: true });
    await batch2.commit();
  } else {
    await ref.update(update);
  }

  const updated = await ref.get();
  return { id: updated.id, ...updated.data() } as LibraryAsset;
}

async function setPreferredBatch(
  uid: string,
  clientId: string,
  assetId: string,
  role: AssetRole,
  batch: FirebaseFirestore.WriteBatch,
): Promise<number> {
  const others = await col(uid, clientId).where('role', '==', role).where('preferred', '==', true).get();
  let unsetCount = 0;
  for (const d of others.docs) {
    if (d.id !== assetId) {
      batch.update(d.ref, { preferred: false, updatedAt: Date.now() });
      unsetCount++;
    }
  }
  batch.update(doc(uid, clientId, assetId), { preferred: true, updatedAt: Date.now() });
  await batch.commit();
  return unsetCount;
}

export async function softDeleteAsset(uid: string, clientId: string, assetId: string): Promise<void> {
  await doc(uid, clientId, assetId).update({ active: false, updatedAt: Date.now() });
}

export async function restoreAsset(uid: string, clientId: string, assetId: string): Promise<LibraryAsset> {
  const ref = doc(uid, clientId, assetId);
  await ref.update({ active: true, updatedAt: Date.now() });
  const snap = await ref.get();
  return { id: snap.id, ...snap.data() } as LibraryAsset;
}

export async function getAsset(uid: string, clientId: string, assetId: string): Promise<LibraryAsset | null> {
  const snap = await doc(uid, clientId, assetId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as LibraryAsset;
}
