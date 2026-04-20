import type { PromptSlot, CompileInput, CompileWarning } from '@/types';

export function renderContextoCarrossel(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  if (!input.carousel || !Array.isArray(input.carousel.slides) || input.carousel.slides.length === 0) {
    return { key: 'CONTEXTO_CARROSSEL', rendered: '', sources: [], skipped: true, skipReason: 'not a carousel' };
  }
  const lines = input.carousel.slides.map(s =>
    `Slide ${s.index + 1}: ${s.compiledSummary ?? '(sem resumo)'}`
  );
  return {
    key: 'CONTEXTO_CARROSSEL',
    rendered: `CONTEXTO DO CARROSSEL ATÉ AQUI:\n${lines.join('\n')}`,
    sources: input.carousel.slides.map(s => ({ kind: 'carousel' as const, slideIndex: s.index })),
  };
}
