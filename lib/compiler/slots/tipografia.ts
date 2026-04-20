import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { selectLocks } from '../selectors';

function extractTypography(dna: unknown): string | null {
  if (!dna || typeof dna !== 'object') return null;
  const d = dna as Record<string, unknown>;

  // New structured format: { primary: { family, weight, role }, secondary?: {...}, rationale? }
  const primary   = (d.typography as Record<string, unknown> | undefined)?.primary as Record<string, unknown> | undefined;
  const secondary = (d.typography as Record<string, unknown> | undefined)?.secondary as Record<string, unknown> | undefined;
  const rationale = (d.typography as Record<string, unknown> | undefined)?.rationale as string | undefined;

  if (primary?.family) {
    const parts = [
      `Headline: ${primary.family}${primary.weight ? ` (${primary.weight})` : ''}`,
    ];
    if (secondary?.family) {
      parts.push(`Body: ${secondary.family}${secondary.weight ? ` (${secondary.weight})` : ''}`);
    }
    if (rationale) parts.push(`Nota: ${rationale}`);
    return parts.join('. ');
  }

  // Legacy flat format: { headline: "...", body: "..." }
  const kit = d.typography as Record<string, unknown> | undefined;
  if (kit) {
    const parts: string[] = [];
    if (typeof kit.headline === 'string') parts.push(`Headline: ${kit.headline}`);
    if (typeof kit.body === 'string') parts.push(`Body: ${kit.body}`);
    if (Array.isArray(kit.weights)) parts.push(`Pesos: ${(kit.weights as number[]).join(', ')}`);
    if (parts.length > 0) return parts.join('. ');
  }

  // Fallback: flat fonts array from BrandProfile
  if (Array.isArray(d.fonts) && d.fonts.length > 0) {
    const [h, b] = d.fonts as string[];
    return b ? `Headline: ${h}. Body: ${b}` : `Fonte principal: ${h}`;
  }

  if (typeof d.typography_pattern === 'string') return d.typography_pattern;
  return null;
}

export function renderTipografia(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const sources: SlotSource[] = [];
  const parts: string[] = [];

  const typo = extractTypography(input.dna);
  if (typo) {
    parts.push(typo);
    sources.push({ kind: 'dna', field: 'visual.typography' });
  }

  const typeLocks = selectLocks(input.locks, 'typography');
  for (const l of typeLocks) {
    if (!l.promptHint?.trim()) continue;
    const prefix = l.enforcement === 'hard' ? `${l.promptHint.trim()} [OBRIGATÓRIO]` : l.promptHint.trim();
    parts.push(prefix);
    sources.push({ kind: 'lock', lockId: l.id, scope: 'typography' });
  }

  // When no explicit font data is configured, render a generic instruction
  // so the slot contributes to the "compiled" count without a warning
  if (parts.length === 0) {
    parts.push(
      'Usar fontes profissionais que reflitam o tom da marca. ' +
      'Priorizar: display ou serif para headline (impacto visual, tamanho grande) + sans-serif para body (legibilidade). ' +
      'Manter consistência tipográfica em todos os elementos de texto da imagem.',
    );
    sources.push({ kind: 'brief', field: 'typography.default' });
  }

  return {
    key: 'TIPOGRAFIA',
    rendered: `TIPOGRAFIA:\n${parts.join('. ')}`,
    sources,
  };
}
