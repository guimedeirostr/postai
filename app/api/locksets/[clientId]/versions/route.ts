import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { adminDb } from '@/lib/firebase-admin';
import { paths } from '@/lib/firestore/paths';
import { FLAGS } from '@/lib/flags';

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { clientId } = await params;

  const snap = await adminDb
    .collection(paths.locksetVersions(user.uid, clientId))
    .orderBy('version', 'desc')
    .limit(20)
    .get();

  const versions = snap.docs.map(d => {
    const data = d.data();
    return {
      versionId: d.id,
      version: data.version ?? 0,
      timestamp: data.savedAt ?? data.lastModifiedAt ?? 0,
      locksCount: (data.locks ?? []).length,
      changesSummary: data.changesSummary ?? '',
    };
  });

  return NextResponse.json({ versions });
}
