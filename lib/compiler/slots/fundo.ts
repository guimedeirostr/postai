import type { PromptSlot, CompileInput, CompileWarning, SlotSource } from '@/types';
import { selectPreferredAsset } from '../selectors';

export function renderFundo(
  input: CompileInput,
  _ctx: { warnings: CompileWarning[]; maxSlotLength: number },
): PromptSlot {
  const asset = selectPreferredAsset(input.assets, 'background');
  if (asset) {
    return {
      key: 'FUNDO',
      rendered: `FUNDO: referência "${asset.slug}" (${asset.label}). Usar como cenário/textura de fundo.`,
      sources: [{ kind: 'asset', assetId: asset.id, role: 'background', slug: asset.slug }],
    };
  }

  const sources: SlotSource[] = [];
  const dna = input.dna as Record<string, unknown> | undefined;
  const bgDesc: string =
    typeof dna?.background_treatment === 'string' ? dna.background_treatment :
    typeof (dna as any)?.visual?.background === 'string' ? (dna as any).visual.background : '';

  if (bgDesc.trim()) {
    sources.push({ kind: 'dna', field: 'visual.background' });
    return {
      key: 'FUNDO',
      rendered: `FUNDO: ${bgDesc.trim()}`,
      sources,
    };
  }

  return { key: 'FUNDO', rendered: '', sources: [], skipped: true, skipReason: 'no background asset or DNA description' };
}
