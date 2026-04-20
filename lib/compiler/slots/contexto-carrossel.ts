import type { PromptSlot, CompileInput, CompileWarning } from '@/types';

const ROLE_HINTS: Record<string, string> = {
  hook:        'Headline forte, curiosidade alta, CTA implícito "arrasta pro lado"',
  context:     'Contextualiza a dor/desejo do público',
  development: 'Explica, exemplifica, demonstra',
  proof:       'Credibilidade, números, before/after',
  product:     'Hero do produto, benefícios tangíveis',
  cta:         'Ação objetiva, urgência apropriada ao tom',
};

const CAROUSEL_FORMATS = new Set(['carousel', 'ig_carousel', 'li_carousel_pdf']);

export function renderContextoCarrossel(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  // Path 1 — per-slide carousel compile (Ciclo 4): has currentSlide context
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

  // Path 2 — legacy slides summary (already compiled prior slides available)
  if (input.carousel?.slides?.length) {
    const lines = input.carousel.slides.map(s =>
      `Slide ${s.index + 1}: ${s.compiledSummary ?? '(sem resumo)'}`
    );
    return {
      key: 'CONTEXTO_CARROSSEL',
      rendered: `CONTEXTO DO CARROSSEL ATÉ AQUI:\n${lines.join('\n')}`,
      sources: input.carousel.slides.map(s => ({ kind: 'carousel' as const, slideIndex: s.index })),
    };
  }

  // Path 3 — format is carousel but no slide context yet: minimal context so slot renders
  const fmt = (input.brief.format as string) ?? '';
  if (CAROUSEL_FORMATS.has(fmt)) {
    return {
      key: 'CONTEXTO_CARROSSEL',
      rendered:
        'CONTEXTO CARROSSEL:\n' +
        'Este é um post no formato carrossel — cada slide deve funcionar de forma independente ' +
        'e manter coerência narrativa com os demais slides.',
      sources: [{ kind: 'brief', field: 'format' }],
    };
  }

  // Path 4 — not a carousel format: skip silently (no warning — "not applicable" is valid)
  return { key: 'CONTEXTO_CARROSSEL', rendered: '', sources: [], skipped: true, skipReason: 'not a carousel' };
}
