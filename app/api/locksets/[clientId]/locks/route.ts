import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getActiveLockset, saveLockset, appendVersion } from '@/lib/lockset/server';
import { lockCreateSchema } from '@/lib/validation/lockset';
import { FLAGS } from '@/lib/flags';
import { randomUUID } from 'crypto';

type Params = { params: Promise<{ clientId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId } = await params;

  const body = await req.json();
  const parsed = lockCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = Date.now();
  const lockId = randomUUID();
  const newLock = {
    ...parsed.data,
    id: lockId,
    createdAt: now,
    updatedAt: now,
    createdBy: user.uid,
    active: true,
  };

  const current = await getActiveLockset(user.uid, clientId);
  const next = {
    ...current,
    id: 'current',
    clientId,
    locks: [...current.locks, newLock],
    version: current.version + 1,
    lastModifiedAt: now,
  };

  await saveLockset(user.uid, next);
  await appendVersion(user.uid, next, `Adicionado lock de ${parsed.data.scope}`);
  console.log(JSON.stringify({ event: 'lockset.lock_added', uid: user.uid, clientId, lockId, scope: parsed.data.scope, enforcement: parsed.data.enforcement }));

  return NextResponse.json(newLock, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId } = await params;

  const { searchParams } = new URL(req.url);
  const lockId = searchParams.get('lockId');
  if (!lockId) return NextResponse.json({ error: 'lockId required' }, { status: 400 });

  const current = await getActiveLockset(user.uid, clientId);
  const next = {
    ...current,
    locks: current.locks.filter(l => l.id !== lockId),
    version: current.version + 1,
    lastModifiedAt: Date.now(),
  };

  await saveLockset(user.uid, next);
  await appendVersion(user.uid, next, `Removido lock ${lockId}`);
  console.log(JSON.stringify({ event: 'lockset.lock_removed', uid: user.uid, clientId, lockId }));

  return NextResponse.json({ ok: true });
}
