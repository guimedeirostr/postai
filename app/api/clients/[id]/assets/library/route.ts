import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { AssetCreateSchema } from '@/lib/assets/schema';
import { listLibraryAssets, createAsset, slugExists } from '@/lib/assets/service';
import { generateUploadUrl } from '@/lib/assets/storage';

type P = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: P) {
  if (!FLAGS.ASSETS_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t0 = Date.now();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: clientId } = await params;
    const { searchParams } = new URL(req.url);
    const role            = searchParams.get('role') ?? undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const assets = await listLibraryAssets(user.uid, clientId, { role, includeInactive });
    console.log(JSON.stringify({ event: 'assets.list.ok', clientId, count: assets.length, ms: Date.now() - t0 }));
    return NextResponse.json({ assets });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'GET /library', error: String(err?.message ?? e), ms: Date.now() - t0 }));
    return NextResponse.json({ assets: [] });
  }
}

export async function POST(req: NextRequest, { params }: P) {
  if (!FLAGS.ASSETS_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t0 = Date.now();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: clientId } = await params;

    const body   = await req.json();
    const parsed = AssetCreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

    const data = parsed.data;

    if (await slugExists(user.uid, clientId, data.slug)) {
      console.log(JSON.stringify({ event: 'assets.create.slug_conflict', clientId, slug: data.slug }));
      return NextResponse.json({ error: 'slug_taken' }, { status: 409 });
    }

    const asset     = await createAsset(user.uid, clientId, data);
    const uploadUrl = await generateUploadUrl(asset.storagePath, data.mimeType);

    console.log(JSON.stringify({ event: 'assets.create.ok', clientId, assetId: asset.id, role: asset.role, slug: asset.slug, bytes: asset.bytes, ms: Date.now() - t0 }));
    return NextResponse.json({ asset, uploadUrl }, { status: 201 });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'POST /library', error: String(err?.message ?? e), stack: err?.stack, ms: Date.now() - t0 }));
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
