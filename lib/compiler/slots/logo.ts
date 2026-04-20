import type { PromptSlot, CompileInput, CompileWarning } from '@/types';
import { selectPreferredAsset } from '../selectors';

export function renderLogo(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const asset = selectPreferredAsset(input.assets, 'logo');
  if (!asset) {
    return { key: 'LOGO', rendered: '', sources: [], skipped: true, skipReason: 'no logo asset' };
  }
  return {
    key: 'LOGO',
    rendered: `LOGO: referência "${asset.slug}" (${asset.label}). Posicionamento: respeitar proporções originais; não distorcer; não recolorir.`,
    sources: [{ kind: 'asset', assetId: asset.id, role: 'logo', slug: asset.slug }],
  };
}
