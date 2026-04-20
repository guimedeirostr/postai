import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { computeLockSuggestions } from '@/lib/lockset/suggestions';
import { FLAGS } from '@/lib/flags';

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!FLAGS.LOCKSET_ENABLED) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId } = await params;
  const t0 = Date.now();

  try {
    const suggestions = await computeLockSuggestions(user.uid, clientId);

    console.log(JSON.stringify({
      event: 'suggestions.ok',
      uid: user.uid,
      clientId,
      count: suggestions.length,
      ms: Date.now() - t0,
    }));

    return NextResponse.json({ suggestions });
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({
      event: 'suggestions.unhandled_error',
      uid: user.uid,
      clientId,
      error: String(err?.message ?? e),
      stack: err?.stack,
      ms: Date.now() - t0,
    }));
    return NextResponse.json({ suggestions: [] });
  }
}
