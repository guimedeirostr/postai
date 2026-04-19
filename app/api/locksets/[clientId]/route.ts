import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { getActiveLockset, saveLockset, appendVersion } from '@/lib/lockset/server';
import { FLAGS } from '@/lib/flags';
import type { BrandLockset } from '@/types';

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId } = await params;
  const lockset = await getActiveLockset(user.uid, clientId);
  return NextResponse.json(lockset);
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId } = await params;
  const body = await req.json() as BrandLockset;
  const now = Date.now();
  const current = await getActiveLockset(user.uid, clientId);
  const next: BrandLockset = {
    ...body,
    id: 'current',
    clientId,
    version: current.version + 1,
    lastModifiedAt: now,
  };
  await saveLockset(user.uid, next);
  await appendVersion(user.uid, next, 'Lockset substituído integralmente');
  console.log(JSON.stringify({ event: 'lockset.created', uid: user.uid, clientId, locksCount: next.locks.length }));
  return NextResponse.json(next);
}
