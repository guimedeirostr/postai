import type { BrandLock, LockScope, PromptSlotKey } from '@/types';

/**
 * Placeholder pro Ciclo 3 (Compiler).
 * Neste ciclo só serve pra UI mostrar "como o lock vai virar prompt-hint".
 */
const SCOPE_TO_SLOT: Record<LockScope, PromptSlotKey> = {
  typography:  'HIERARQUIA_TIPO',
  color:       'PALETA',
  composition: 'COMPOSICAO',
  signature:   'ELEMENTOS_GRAFICOS',
  cta:         'ACABAMENTO',
  tone:        'ESTETICA_MAE',
  forbidden:   'ESTETICA_MAE',
};

export function previewLockAsPromptHint(lock: BrandLock): {
  slotKey: PromptSlotKey;
  hint: string;
  enforcement: 'hard' | 'soft';
} {
  const slotKey = SCOPE_TO_SLOT[lock.scope];
  const hint = lock.enforcement === 'hard'
    ? `[OBRIGATÓRIO] ${lock.promptHint}`
    : lock.promptHint;

  console.log(JSON.stringify({ event: 'lockset.preview_viewed', lockId: lock.id }));

  return { slotKey, hint, enforcement: lock.enforcement };
}
