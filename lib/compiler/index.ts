import { SLOT_ORDER } from '@/types';
import type { CompileInput, CompileOutput, PromptSlot } from '@/types';
import { renderBrandIdentity } from './slots/brand-identity';
import { renderToneAndVoice } from './slots/tone-and-voice';
import { renderPaleta } from './slots/paleta';
import { renderTipografia } from './slots/tipografia';
import { renderLogo } from './slots/logo';
import { renderProduto } from './slots/produto';
import { renderPessoa } from './slots/pessoa';
import { renderFundo } from './slots/fundo';
import { renderBriefing } from './slots/briefing';
import { renderRestricoesDuras } from './slots/restricoes-duras';
import { renderContextoCarrossel } from './slots/contexto-carrossel';

const RENDERERS = {
  BRAND_IDENTITY:     renderBrandIdentity,
  TONE_AND_VOICE:     renderToneAndVoice,
  PALETA:             renderPaleta,
  TIPOGRAFIA:         renderTipografia,
  LOGO:               renderLogo,
  PRODUTO:            renderProduto,
  PESSOA:             renderPessoa,
  FUNDO:              renderFundo,
  BRIEFING:           renderBriefing,
  RESTRICOES_DURAS:   renderRestricoesDuras,
  CONTEXTO_CARROSSEL: renderContextoCarrossel,
};

export function compilePrompt(input: CompileInput): CompileOutput {
  const t0 = Date.now();
  const maxSlotLength = input.options?.maxSlotLength ?? 600;
  const warnings: CompileOutput['warnings'] = [];
  const slots: PromptSlot[] = [];
  const assetsApplied: CompileOutput['trace']['assetsApplied'] = [];
  let hardCount = 0, softCount = 0;

  for (const key of SLOT_ORDER) {
    const renderer = RENDERERS[key];
    const result = renderer(input, { warnings, maxSlotLength });

    // Truncate oversized slots
    if (!result.skipped && result.rendered.length > maxSlotLength) {
      const original = result.rendered;
      result.rendered = original.slice(0, maxSlotLength) + '...';
      warnings.push({
        code: 'slot_truncated',
        slot: key,
        message: `Slot ${key} truncado`,
        detail: { originalLength: original.length },
      });
    }

    slots.push(result);

    for (const src of result.sources) {
      if (src.kind === 'asset') {
        assetsApplied.push({ role: src.role, assetId: src.assetId, slug: src.slug });
      }
    }
  }

  if (Array.isArray(input.locks)) {
    for (const l of input.locks as { active?: boolean; enforcement?: string }[]) {
      if (l?.active === false) continue;
      if (l?.enforcement === 'hard') hardCount++;
      else if (l?.enforcement === 'soft') softCount++;
    }
  }

  if (!input.dna) {
    warnings.push({ code: 'missing_dna', message: 'DNA Visual não encontrado — slots de identidade usam defaults' });
  }

  const compiled = slots
    .filter(s => !s.skipped && s.rendered.trim().length > 0)
    .map(s => s.rendered)
    .join('\n\n');

  return {
    compiled,
    slots,
    trace: {
      clientId: input.client.id,
      phase: input.brief.phase,
      format: input.brief.format,
      totalChars: compiled.length,
      slotsRendered: slots.filter(s => !s.skipped).length,
      slotsSkipped: slots.filter(s => !!s.skipped).length,
      locksApplied: { hard: hardCount, soft: softCount },
      assetsApplied,
      ms: Date.now() - t0,
    },
    warnings,
  };
}

export { selectPreferredAsset, selectLocks, extractHexFromPromptHint } from './selectors';
export { compileCarousel } from './carousel';
