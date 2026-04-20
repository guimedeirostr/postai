import type { PromptSlot, CompileInput, CompileWarning } from '@/types';
import { selectPreferredAsset } from '../selectors';

export function renderPessoa(
  input: CompileInput,
  ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const asset = selectPreferredAsset(input.assets, 'person');
  if (!asset) {
    ctx.warnings.push({
      code: 'asset_role_empty',
      slot: 'PESSOA',
      message: 'Nenhum asset com role=person encontrado',
    });
    return { key: 'PESSOA', rendered: '', sources: [], skipped: true, skipReason: 'no person asset' };
  }
  return {
    key: 'PESSOA',
    rendered: `PESSOA: referência "${asset.slug}" (${asset.label}). Manter identidade visual — rosto, expressão e enquadramento fiéis à referência.`,
    sources: [{ kind: 'asset', assetId: asset.id, role: 'person', slug: asset.slug }],
  };
}
