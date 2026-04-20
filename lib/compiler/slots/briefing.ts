import type { PromptSlot, CompileInput, CompileWarning } from '@/types';

export function renderBriefing(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const { objective, format, extra } = input.brief;

  if (!objective?.trim()) {
    ctx.warnings.push({
      code: 'brief_empty',
      slot: 'BRIEFING',
      message: 'Briefing vazio — usando default',
    });
    return {
      key: 'BRIEFING',
      rendered: 'BRIEFING: (não fornecido — gerar a partir do contexto)',
      sources: [{ kind: 'brief', field: 'objective' }],
    };
  }

  const parts = [`Objetivo: ${objective.trim()}`, `Formato: ${format}`];
  if (extra?.headline && typeof extra.headline === 'string') parts.push(`Headline sugerido: ${extra.headline}`);
  if (extra?.cta && typeof extra.cta === 'string') parts.push(`CTA: ${extra.cta}`);

  return {
    key: 'BRIEFING',
    rendered: `BRIEFING:\n${parts.join('\n')}`,
    sources: [{ kind: 'brief', field: 'objective' }],
  };
}
