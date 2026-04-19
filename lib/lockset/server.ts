import { adminDb } from '@/lib/firebase-admin';
import { paths } from '@/lib/firestore/paths';
import type { BrandLockset } from '@/types';

const EMPTY_LOCKSET = (clientId: string): BrandLockset => ({
  id: 'current',
  clientId,
  locks: [],
  version: 0,
  lastModifiedAt: Date.now(),
});

export async function getActiveLockset(uid: string, clientId: string): Promise<BrandLockset> {
  const snap = await adminDb.doc(paths.lockset(uid, clientId)).get();
  if (!snap.exists) return EMPTY_LOCKSET(clientId);
  return { id: snap.id, ...snap.data() } as BrandLockset;
}

export async function saveLockset(uid: string, lockset: BrandLockset): Promise<void> {
  const path = paths.lockset(uid, lockset.clientId);
  await adminDb.doc(path).set({ ...lockset }, { merge: false });
  console.log(JSON.stringify({ event: 'lockset.saved', uid, clientId: lockset.clientId, version: lockset.version }));
}

export async function appendVersion(uid: string, lockset: BrandLockset, summary: string): Promise<void> {
  const versionId = String(lockset.version);
  const path = paths.locksetVersion(uid, lockset.clientId, versionId);
  await adminDb.doc(path).set({
    ...lockset,
    versionId,
    savedAt: Date.now(),
    changesSummary: summary,
  });
}
