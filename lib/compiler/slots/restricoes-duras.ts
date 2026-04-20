import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { BrandLock } from '@/types';

export function renderRestricoesDuras(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  if (!Array.isArray(input.locks)) {
    ctx.warnings.push({ code: 'no_hard_locks', slot: 'RESTRICOES_DURAS', message: 'Sem locks configurados' });
    return { key: 'RESTRICOES_DURAS', rendered: '', sources: [], skipped: true, skipReason: 'no locks' };
  }

  const hardLocks = (input.locks as BrandLock[]).filter(
    l => l?.active !== false && l?.enforcement === 'hard'
  );

  if (hardLocks.length === 0) {
    ctx.warnings.push({ code: 'no_hard_locks', slot: 'RESTRICOES_DURAS', message: 'Nenhum lock OBRIGATÓRIO configurado' });
    return { key: 'RESTRICOES_DURAS', rendered: '', sources: [], skipped: true, skipReason: 'no hard locks' };
  }

  const sources: SlotSource[] = hardLocks.map(l => ({ kind: 'lock' as const, lockId: l.id, scope: l.scope }));
  const lines = hardLocks.map(l => `- [OBRIGATÓRIO] ${l.promptHint}`);

  return {
    key: 'RESTRICOES_DURAS',
    rendered: `RESTRIÇÕES OBRIGATÓRIAS:\n${lines.join('\n')}`,
    sources,
  };
}
