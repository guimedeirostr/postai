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

  const suggestions = await computeLockSuggestions(user.uid, clientId);
  console.log(JSON.stringify({ event: 'lockset.auto_suggested', uid: user.uid, clientId, suggestionCount: suggestions.length, accepted: false }));

  return NextResponse.json({ suggestions });
}
