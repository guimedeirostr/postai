import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { AssetUpdateSchema } from '@/lib/assets/schema';
import { getAsset, updateAsset, softDeleteAsset } from '@/lib/assets/service';

type P = { params: Promise<{ id: string; assetId: string }> };

export async function PATCH(req: NextRequest, { params }: P) {
  if (!FLAGS.ASSETS_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t0 = Date.now();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: clientId, assetId } = await params;

    const existing = await getAsset(user.uid, clientId, assetId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let raw: unknown;
    try {
      raw = await req.json();
    } catch (e) {
      console.log(JSON.stringify({ event: 'assets.update.invalid_json', clientId, assetId, error: String((e as Error)?.message ?? e) }));
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = AssetUpdateSchema.safeParse(raw);
    if (!parsed.success) {
      console.log(JSON.stringify({
        event: 'assets.update.validation_failed',
        clientId,
        assetId,
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), code: i.code, message: i.message })),
      }));
      return NextResponse.json({ error: 'validation_failed', issues: parsed.error.issues }, { status: 400 });
    }

    const updated  = await updateAsset(user.uid, clientId, assetId, parsed.data);
    const fields   = Object.keys(parsed.data);
    const wasPrefer = parsed.data.preferred === true;

    if (wasPrefer) {
      console.log(JSON.stringify({ event: 'assets.update.preferred_changed', clientId, assetId, role: updated.role }));
    }
    console.log(JSON.stringify({ event: 'assets.update.ok', clientId, assetId, fields, ms: Date.now() - t0 }));
    return NextResponse.json({ asset: updated });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'PATCH /library/[assetId]', error: String(err?.message ?? e), ms: Date.now() - t0 }));
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: P) {
  if (!FLAGS.ASSETS_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const t0 = Date.now();
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id: clientId, assetId } = await params;

    const existing = await getAsset(user.uid, clientId, assetId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await softDeleteAsset(user.uid, clientId, assetId);
    console.log(JSON.stringify({ event: 'assets.delete.ok', clientId, assetId, ms: Date.now() - t0 }));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({ event: 'assets.unhandled_error', endpoint: 'DELETE /library/[assetId]', error: String(err?.message ?? e), ms: Date.now() - t0 }));
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
