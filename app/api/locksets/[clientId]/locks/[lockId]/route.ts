import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getActiveLockset, saveLockset, appendVersion } from '@/lib/lockset/server';
import { lockUpdateSchema } from '@/lib/validation/lockset';
import { FLAGS } from '@/lib/flags';

type Params = { params: Promise<{ clientId: string; lockId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId, lockId } = await params;

  const body = await req.json();
  const parsed = lockUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const current = await getActiveLockset(user.uid, clientId);
  const lockIdx = current.locks.findIndex(l => l.id === lockId);
  if (lockIdx === -1) return NextResponse.json({ error: 'Lock not found' }, { status: 404 });

  const changedFields = Object.keys(parsed.data);
  const updatedLock = { ...current.locks[lockIdx], ...parsed.data, updatedAt: Date.now() };
  const newLocks = [...current.locks];
  newLocks[lockIdx] = updatedLock;

  const next = {
    ...current,
    locks: newLocks,
    version: current.version + 1,
    lastModifiedAt: Date.now(),
  };

  await saveLockset(user.uid, next);
  await appendVersion(user.uid, next, `Editado lock ${lockId}`);
  console.log(JSON.stringify({ event: 'lockset.lock_edited', uid: user.uid, clientId, lockId, changedFields }));

  return NextResponse.json(updatedLock);
}
