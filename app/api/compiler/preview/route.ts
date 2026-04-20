import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { adminDb } from '@/lib/firebase-admin';
import { paths } from '@/lib/firestore/paths';
import { getActiveLockset } from '@/lib/lockset/server';
import { listLibraryAssets } from '@/lib/assets/service';
import { compilePrompt } from '@/lib/compiler';
import type { CompileInput } from '@/types';

const CompilerPreviewSchema = z.object({
  clientId: z.string().min(1),
  brief: z.object({
    objective: z.string().default(''),
    format: z.enum(['feed', 'story', 'carousel', 'reels', 'linkedin_post']).default('feed'),
    phase: z.enum(['briefing', 'plano', 'prompt', 'copy', 'critica', 'output', 'memoria']).default('prompt'),
    extra: z.record(z.string(), z.unknown()).optional(),
  }),
  carousel: z.object({
    slides: z.array(z.object({
      index: z.number(),
      compiledSummary: z.string().optional(),
    })),
  }).optional(),
  options: z.object({
    includeSoftLocks: z.boolean().optional(),
    maxSlotLength: z.number().optional(),
    language: z.literal('pt-BR').optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  if (!FLAGS.COMPILER_ENABLED) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const t0 = Date.now();
  let uid = '';
  let clientId = '';
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    uid = user.uid;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const parsed = CompilerPreviewSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.issues }, { status: 400 });
    }

    clientId = parsed.data.clientId;
    console.log(JSON.stringify({ event: 'compiler.preview.request', cid: clientId, uid }));

    // Verify client ownership
    const clientSnap = await adminDb.doc(paths.client(uid, clientId)).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: 'missing_client' }, { status: 404 });
    }
    const clientData = clientSnap.data() ?? {};

    // Fetch DNA (brandKit), locks and assets in parallel
    const [lockset, assets, brandKitSnap] = await Promise.all([
      getActiveLockset(uid, clientId),
      listLibraryAssets(uid, clientId, { includeInactive: false }),
      adminDb.doc(paths.brandKit(uid, clientId)).get(),
    ]);

    const dna = brandKitSnap.exists ? brandKitSnap.data() : undefined;

    const input: CompileInput = {
      client: {
        id: clientId,
        name: (clientData.name as string | undefined) ?? clientId,
        handle: (clientData.handle as string | undefined) ?? undefined,
        segment: (clientData.segment as string | undefined) ?? undefined,
      },
      dna,
      locks: lockset.locks,
      assets,
      brief: parsed.data.brief,
      carousel: parsed.data.carousel,
      options: parsed.data.options,
    };

    const output = compilePrompt(input);

    console.log(JSON.stringify({
      event: 'compiler.preview.success',
      cid: clientId,
      uid,
      slotsCompiled: output.trace.slotsRendered,
      warnings: output.warnings.length,
      durationMs: Date.now() - t0,
    }));

    return NextResponse.json(output);
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({
      event: 'compiler.preview.error',
      cid: clientId,
      uid,
      errorCode: 'internal',
      errorMessage: String(err?.message ?? e),
      ms: Date.now() - t0,
    }));
    return NextResponse.json({ error: 'internal_error' }, { status: 503 });
  }
}
