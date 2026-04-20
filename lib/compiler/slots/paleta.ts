import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { selectLocks, extractHexFromPromptHint } from '../selectors';

function extractPalette(dna: unknown): string[] {
  if (!dna || typeof dna !== 'object') return [];
  const d = dna as Record<string, unknown>;
  const kit = d.palette as Record<string, unknown> | undefined;
  if (kit) {
    const colors: string[] = [];
    if (typeof kit.primary === 'string') colors.push(kit.primary);
    if (typeof kit.secondary === 'string') colors.push(kit.secondary);
    if (Array.isArray(kit.accents)) colors.push(...(kit.accents as string[]).filter(c => typeof c === 'string'));
    return colors.filter(Boolean);
  }
  if (typeof d.color_treatment === 'string') return [];
  return [];
}

export function renderPaleta(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const sources: SlotSource[] = [];
  const hardColors: string[] = [];
  const softColors: string[] = [];
  const dnaColors: string[] = [];

  const pal = extractPalette(input.dna);
  if (pal.length > 0) {
    dnaColors.push(...pal);
    sources.push({ kind: 'dna', field: 'visual.palette' });
  }

  const colorLocks = selectLocks(input.locks, 'color');
  for (const l of colorLocks) {
    const hex = extractHexFromPromptHint(l.promptHint);
    if (!hex) continue;
    if (l.enforcement === 'hard') hardColors.push(hex);
    else softColors.push(hex);
    sources.push({ kind: 'lock', lockId: l.id, scope: 'color' });
  }

  const hasData = dnaColors.length + hardColors.length + softColors.length > 0;
  if (!hasData) {
    return { key: 'PALETA', rendered: '', sources: [], skipped: true, skipReason: 'no palette data in DNA or locks' };
  }

  const final = [
    ...hardColors.map(c => `${c} [OBRIGATÓRIO]`),
    ...softColors,
    ...dnaColors.filter(c => !hardColors.includes(c) && !softColors.includes(c)),
  ];

  return {
    key: 'PALETA',
    rendered: `PALETA:\n${final.join(', ')}`,
    sources,
  };
}
