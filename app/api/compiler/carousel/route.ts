import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/session';
import { FLAGS } from '@/lib/flags';
import { adminDb } from '@/lib/firebase-admin';
import { paths } from '@/lib/firestore/paths';
import { getActiveLockset } from '@/lib/lockset/server';
import { listLibraryAssets } from '@/lib/assets/service';
import { compileCarousel } from '@/lib/compiler/carousel';
import { validateCustomStoryboard } from '@/lib/compiler/storyboard';
import { carouselStrings } from '@/lib/i18n/pt-br';
import type { CompileInput, SlideRole } from '@/types';

const SlideRoleEnum = z.enum(['hook', 'context', 'development', 'proof', 'product', 'cta']);

const BodySchema = z.object({
  clientId: z.string().min(1),
  brief: z.object({
    objective: z.string().default(''),
    tone: z.string().optional(),
    audience: z.string().optional(),
    format: z.literal('carousel'),
    platform: z.string().optional(),
    carousel: z.object({
      slides_count: z.number().int().min(2).max(10),
      storyboard: z.enum(['auto', 'custom']).optional(),
      slides_override: z.array(SlideRoleEnum).optional(),
    }),
  }),
});

export async function POST(req: NextRequest) {
  if (!FLAGS.CAROUSEL_ENABLED) {
    return NextResponse.json({ error: carouselStrings.errors.not_found }, { status: 404 });
  }

  const t0 = Date.now();
  let uid = '';
  let clientId = '';

  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: carouselStrings.errors.unauthenticated }, { status: 401 });
    uid = user.uid;

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: carouselStrings.errors.invalid_body }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: carouselStrings.errors.invalid_body, details: parsed.error.issues }, { status: 400 });
    }

    clientId = parsed.data.clientId;
    const { brief } = parsed.data;
    const { slides_count, storyboard, slides_override } = brief.carousel;

    // Validate custom storyboard before any I/O
    if (storyboard === 'custom' && slides_override) {
      const validation = validateCustomStoryboard(slides_override as string[], slides_count);
      if (!validation.valid) {
        const msg = validation.error === 'invalid_storyboard_sequence'
          ? carouselStrings.errors.invalid_storyboard_sequence
          : carouselStrings.errors.invalid_body;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    console.log(JSON.stringify({
      event: 'compiler.carousel.request',
      uid,
      cid: clientId,
      slides_count,
      storyboard_mode: storyboard ?? 'auto',
    }));

    // Ownership check
    const clientSnap = await adminDb.collection('clients').doc(clientId).get();
    if (!clientSnap.exists || clientSnap.data()?.agency_id !== uid) {
      return NextResponse.json({ error: carouselStrings.errors.missing_client }, { status: 404 });
    }
    const clientData = clientSnap.data() ?? {};

    // Fetch DNA, locks, assets in parallel
    const [lockset, assets, brandKitSnap] = await Promise.all([
      getActiveLockset(uid, clientId),
      listLibraryAssets(uid, clientId, { includeInactive: false }),
      adminDb.doc(paths.brandKit(uid, clientId)).get(),
    ]);

    const dna = brandKitSnap.exists
      ? brandKitSnap.data()
      : {
          palette: {
            primary:   clientData.primary_color   ?? null,
            secondary: clientData.secondary_color ?? null,
            accents:   [] as string[],
          },
          voice_tone: (clientData.tone_of_voice as string | undefined) ?? null,
          typography: null,
        };

    const rawHandle = String(clientData.instagram_handle ?? '');
    const handle = rawHandle.replace(/^@+/, '');

    const baseInput: CompileInput = {
      client: {
        id: clientId,
        name: (clientData.name as string | undefined) ?? clientId,
        handle: handle || undefined,
        segment: (clientData.segment as string | undefined) ?? undefined,
      },
      dna,
      locks: lockset.locks,
      assets,
      brief: {
        objective: brief.objective,
        format: 'carousel',
        phase: 'prompt',
        extra: { tone: brief.tone, audience: brief.audience },
      },
    };

    const result = compileCarousel({
      base: baseInput,
      slidesCount: slides_count,
      storyboard: storyboard ?? 'auto',
      slidesOverride: slides_override as SlideRole[] | undefined,
    });

    const totalMs = Date.now() - t0;
    console.log(JSON.stringify({
      event: 'compiler.carousel.success',
      uid,
      cid: clientId,
      slides_count,
      totalMs,
      locksHard: result.meta.locksApplied.hard,
      globalWarnings: result.globalWarnings.length,
    }));

    return NextResponse.json(result);
  } catch (e: unknown) {
    const err = e as Error | undefined;
    console.log(JSON.stringify({
      event: 'compiler.carousel.error',
      uid,
      cid: clientId,
      errorCode: 'internal',
      errorMessage: String(err?.message ?? e),
    }));
    return NextResponse.json({ error: carouselStrings.errors.internal_error }, { status: 503 });
  }
}
