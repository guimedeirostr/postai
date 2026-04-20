import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { selectLocks } from '../selectors';

export function renderToneAndVoice(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const sources: SlotSource[] = [];
  const parts: string[] = [];

  const dna = input.dna as Record<string, unknown> | undefined;
  const voiceTone = dna?.voice_tone ?? (dna as any)?.voice?.tone;
  if (typeof voiceTone === 'string' && voiceTone.trim()) {
    parts.push(voiceTone.trim());
    sources.push({ kind: 'dna', field: 'voice.tone' });
  }

  const toneLocks = selectLocks(input.locks, 'tone');
  for (const l of toneLocks) {
    if (l.promptHint?.trim()) {
      parts.push(l.promptHint.trim());
      sources.push({ kind: 'lock', lockId: l.id, scope: 'tone' });
    }
  }

  if (parts.length === 0) {
    return {
      key: 'TONE_AND_VOICE',
      rendered: '',
      sources: [],
      skipped: true,
      skipReason: 'no tone data',
    };
  }

  const rendered = `TOM E VOZ: ${parts.join('. ')}`;
  return { key: 'TONE_AND_VOICE', rendered, sources };
}
