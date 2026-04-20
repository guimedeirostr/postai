import type { SlideRole } from '@/types';

export const STORYBOARDS: Record<number, SlideRole[]> = {
  2:  ['hook', 'cta'],
  3:  ['hook', 'development', 'cta'],
  4:  ['hook', 'context', 'development', 'cta'],
  5:  ['hook', 'context', 'development', 'proof', 'cta'],
  6:  ['hook', 'context', 'development', 'proof', 'product', 'cta'],
  7:  ['hook', 'context', 'development', 'development', 'proof', 'product', 'cta'],
  8:  ['hook', 'context', 'development', 'development', 'proof', 'product', 'product', 'cta'],
  9:  ['hook', 'context', 'development', 'development', 'development', 'proof', 'product', 'product', 'cta'],
  10: ['hook', 'context', 'development', 'development', 'development', 'proof', 'proof', 'product', 'product', 'cta'],
};

export const VALID_SLIDE_ROLES: readonly SlideRole[] = ['hook', 'context', 'development', 'proof', 'product', 'cta'];

export function pickStoryboard(n: number): SlideRole[] {
  return STORYBOARDS[n] ?? STORYBOARDS[5];
}

export function validateCustomStoryboard(
  override: string[],
  count: number,
): { valid: true; sequence: SlideRole[] } | { valid: false; error: 'invalid_storyboard_sequence' | 'invalid_body' } {
  if (override.length !== count) {
    return { valid: false, error: 'invalid_storyboard_sequence' };
  }
  for (const role of override) {
    if (!(VALID_SLIDE_ROLES as readonly string[]).includes(role)) {
      return { valid: false, error: 'invalid_body' };
    }
  }
  return { valid: true, sequence: override as SlideRole[] };
}
