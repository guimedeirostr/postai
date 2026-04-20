import type { PromptSlot, CompileInput, CompileWarning } from '@/types';

const ROLE_HINTS: Record<string, string> = {
  hook:        'Headline forte, curiosidade alta, CTA implícito "arrasta pro lado"',
  context:     'Contextualiza a dor/desejo do público',
  development: 'Explica, exemplifica, demonstra',
  proof:       'Credibilidade, números, before/after',
  product:     'Hero do produto, benefícios tangíveis',
  cta:         'Ação objetiva, urgência apropriada ao tom',
};

export function renderContextoCarrossel(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const currentSlide = input.carousel?.currentSlide;

  if (currentSlide) {
    const { index, role, totalSlides } = currentSlide;
    const hint = ROLE_HINTS[role] ?? '';
    const lines = [
      'CONTEXTO CARROSSEL:',
      `Posição: Slide ${index + 1} de ${totalSlides}`,
      `Papel: ${role}`,
    ];
    if (hint) lines.push(`Foco: ${hint}`);
    return {
      key: 'CONTEXTO_CARROSSEL',
      rendered: lines.join('\n'),
      sources: [{ kind: 'carousel', slideIndex: index }],
    };
  }

  if (!input.carousel?.slides?.length) {
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
