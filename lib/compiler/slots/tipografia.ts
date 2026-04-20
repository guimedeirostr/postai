import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { selectLocks } from '../selectors';

function extractTypography(dna: unknown): string | null {
  if (!dna || typeof dna !== 'object') return null;
  const d = dna as Record<string, unknown>;
  const kit = d.typography as Record<string, unknown> | undefined;
  if (kit) {
    const parts: string[] = [];
    if (typeof kit.headline === 'string') parts.push(`Headline: ${kit.headline}`);
    if (typeof kit.body === 'string') parts.push(`Body: ${kit.body}`);
    if (Array.isArray(kit.weights)) parts.push(`Pesos: ${(kit.weights as number[]).join(', ')}`);
    return parts.length > 0 ? parts.join('. ') : null;
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

  if (parts.length === 0) {
    return { key: 'TIPOGRAFIA', rendered: '', sources: [], skipped: true, skipReason: 'no typography data' };
  }

  return {
    key: 'TIPOGRAFIA',
    rendered: `TIPOGRAFIA:\n${parts.join('. ')}`,
    sources,
  };
}
