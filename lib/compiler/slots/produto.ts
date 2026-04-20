import type { PromptSlot, CompileInput, CompileWarning } from '@/types';
import { selectPreferredAsset } from '../selectors';

export function renderProduto(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const asset = selectPreferredAsset(input.assets, 'product');
  if (!asset) {
    return { key: 'PRODUTO', rendered: '', sources: [], skipped: true, skipReason: 'no product asset' };
  }
  return {
    key: 'PRODUTO',
    rendered: `PRODUTO: referência "${asset.slug}" (${asset.label}). Produto/hero principal do post — destaque visual, alta fidelidade.`,
    sources: [{ kind: 'asset', assetId: asset.id, role: 'product', slug: asset.slug }],
  };
}
