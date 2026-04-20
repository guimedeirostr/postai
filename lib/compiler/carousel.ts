import { compilePrompt } from './index';
import { pickStoryboard } from './storyboard';
import type {
  CompileInput,
  CompileWarning,
  CarouselCompileOutput,
  CarouselSlideCompile,
  SlideRole,
  PromptSlot,
  SlotKey,
} from '@/types';

export interface CarouselCompileInput {
  base: CompileInput;
  slidesCount: number;
  storyboard?: 'auto' | 'custom';
  slidesOverride?: SlideRole[];
}

const SHARED_SLOT_KEYS: SlotKey[] = [
  'BRAND_IDENTITY',
  'TONE_AND_VOICE',
  'PALETA',
  'TIPOGRAFIA',
  'LOGO',
  'PRODUTO',
  'FUNDO',
  'RESTRICOES_DURAS',
];

export function extractSharedBase(
  slots: PromptSlot[],
): Partial<Record<SlotKey, PromptSlot>> {
  const byKey = Object.fromEntries(slots.map(s => [s.key, s]));
  return Object.fromEntries(
    SHARED_SLOT_KEYS.map(k => [k, byKey[k]]).filter(([, v]) => v !== undefined),
  ) as Partial<Record<SlotKey, PromptSlot>>;
}

export function aggregateGlobalWarnings(
  allWarnings: CompileWarning[][],
  totalSlides: number,
): CompileWarning[] {
  const countByCode = new Map<string, number>();
  for (const slideWarnings of allWarnings) {
    const seen = new Set<string>();
    for (const w of slideWarnings) {
      if (!seen.has(w.code)) {
        seen.add(w.code);
        countByCode.set(w.code, (countByCode.get(w.code) ?? 0) + 1);
      }
    }
  }
  const global: CompileWarning[] = [];
  for (const [code, count] of countByCode) {
    if (count === totalSlides) {
      const example = allWarnings.flat().find(w => w.code === code)!;
      global.push({ ...example });
    }
  }
  return global;
}

export function compileCarousel(input: CarouselCompileInput): CarouselCompileOutput {
  const { base, slidesCount } = input;
  const sequence =
    input.storyboard === 'custom' && input.slidesOverride
      ? input.slidesOverride
      : pickStoryboard(slidesCount);

  // Compile sharedBase once without carousel context
  const baseOutput = compilePrompt(base);
  const sharedBase = extractSharedBase(baseOutput.slots);

  const slides: CarouselSlideCompile[] = [];
  const allWarnings: CompileWarning[][] = [];

  for (let i = 0; i < slidesCount; i++) {
    const role = sequence[i];
    const slideInput: CompileInput = {
      ...base,
      carousel: {
        slides: [],
        currentSlide: { index: i, role, totalSlides: slidesCount },
      },
    };

    const slideOutput = compilePrompt(slideInput);

    console.log(JSON.stringify({
      event: 'compiler.carousel.slide.compiled',
      cid: base.client.id,
      slideIndex: i,
      role,
      slotsRendered: slideOutput.trace.slotsRendered,
      chars: slideOutput.trace.totalChars,
    }));

    allWarnings.push(slideOutput.warnings);

    slides.push({
      index: i,
      role,
      compiled: slideOutput.compiled,
      slots: slideOutput.slots,
      chars: slideOutput.trace.totalChars,
      slotsRendered: slideOutput.trace.slotsRendered,
    });
  }

  const globalWarnings = aggregateGlobalWarnings(allWarnings, slidesCount);

  for (const w of globalWarnings) {
    console.log(JSON.stringify({
      event: 'compiler.carousel.global_warning',
      cid: base.client.id,
      code: w.code,
    }));
  }

  const totalChars = slides.reduce((sum, s) => sum + s.chars, 0);

  return {
    slides,
    meta: {
      slides_count: slidesCount,
      storyboard_mode: input.storyboard === 'custom' ? 'custom' : 'auto',
      locksApplied: baseOutput.trace.locksApplied,
      assetsApplied: baseOutput.trace.assetsApplied,
      totalChars,
      compiledAt: Date.now(),
    },
    sharedBase,
    globalWarnings,
  };
}
