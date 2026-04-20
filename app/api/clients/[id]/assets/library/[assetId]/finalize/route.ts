import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { getAsset, finalizeAsset } from '@/lib/assets/service';
import { finalizeAssetUrl } from '@/lib/assets/storage';

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

    let downloadUrl: string;
    try {
      downloadUrl = await finalizeAssetUrl(existing.storagePath);
    } catch {
      console.log(JSON.stringify({ event: 'assets.finalize.storage_missing', clientId, assetId, storagePath: existing.storagePath }));
      return NextResponse.json({ error: 'Upload not found in Storage. Please re-upload.' }, { status: 400 });
    }

    const asset = await finalizeAsset(user.uid, clientId, assetId, downloadUrl);
    console.log(JSON.stringify({ event: 'assets.finalize.ok', clientId, assetId, downloadUrlLen: downloadUrl.length, ms: Date.now() - t0 }));
    return NextResponse.json({ asset });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'POST finalize', error: String(err?.message ?? e), ms: Date.now() - t0 }));
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
