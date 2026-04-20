import type { PromptSlot, CompileInput, CompileWarning } from '@/types';
import { selectPreferredAsset } from '../selectors';

export function renderPessoa(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const asset = selectPreferredAsset(input.assets, 'person');

  if (!asset) {
    // "not applicable" — no warning; only add PESSOA context when a person asset exists
    return { key: 'PESSOA', rendered: '', sources: [], skipped: true, skipReason: 'no person asset' };
  }

  return {
    key: 'PESSOA',
    rendered:
      `PESSOA: referência "${asset.slug}" (${asset.label}). ` +
      `Manter identidade visual — rosto, expressão, enquadramento e vestimenta fiéis à referência em todos os slides.`,
    sources: [{ kind: 'asset', assetId: asset.id, role: 'person', slug: asset.slug }],
  };
}
