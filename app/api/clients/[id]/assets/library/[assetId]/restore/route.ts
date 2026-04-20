import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { restoreAsset, getAsset } from '@/lib/assets/service';

type P = { params: Promise<{ id: string; assetId: string }> };

export async function POST(_req: NextRequest, { params }: P) {
  if (!FLAGS.ASSETS_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t0 = Date.now();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: clientId, assetId } = await params;

    const existing = await getAsset(user.uid, clientId, assetId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const asset = await restoreAsset(user.uid, clientId, assetId);
    console.log(JSON.stringify({ event: 'assets.restore.ok', clientId, assetId, ms: Date.now() - t0 }));
    return NextResponse.json({ asset });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'POST restore', error: String(err?.message ?? e), ms: Date.now() - t0 }));
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
