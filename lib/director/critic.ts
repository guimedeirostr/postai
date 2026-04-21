import Anthropic from "@anthropic-ai/sdk";
import type { PlanoDePost } from "@/types";
import { estimateCost } from "@/lib/canvas/trace";
import type { TraceEmitter } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export interface DirectorCriticParams {
  imageUrl: string;
  brief: string;
  clientName?: string;
  plan?: PlanoDePost;
  slideN?: number;
  emit?: TraceEmitter;
}

export interface DirectorCriticOutput {
  score: number;
  notes: string;
}

function buildCriticPrompt(params: DirectorCriticParams): string {
  const { brief, clientName, plan, slideN } = params;
  const slideCtx = slideN != null ? ` (Slide ${slideN})` : '';
  return `Você é um diretor de arte experiente avaliando um post de mídia social${slideCtx}.

MARCA: ${clientName ?? 'não informada'}
${plan?.bigIdea ? `Big Idea: ${plan.bigIdea}` : ''}
${plan?.publico ? `Público-alvo: ${plan.publico}` : ''}
COPY/BRIEFING: ${brief}

Avalie a imagem acima em relação ao copy e ao objetivo do post.

Critérios (peso igual):
1. Impacto visual — composição, hierarquia, atração imediata
2. Alinhamento copy×visual — a imagem complementa o texto?
3. Clareza da mensagem — a proposta de valor está clara?
4. Qualidade técnica — resolução, cores, iluminação
5. Potencial de engajamento — provoca curiosidade, emoção ou ação?

Retorne APENAS JSON puro:
{
  "score": número_de_1_a_10,
  "notes": "análise concisa (2–3 frases) com o principal ponto forte e o principal ponto de melhoria"
}`;
}

export async function runDirectorCritic(params: DirectorCriticParams): Promise<DirectorCriticOutput> {
  const { imageUrl, emit } = params;

  // Fetch image and convert to base64 (safer than URL source across all Claude models)
  let imageBase64 = '';
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg';
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    mediaType = (ct.split(';')[0].trim()) as typeof mediaType;
    imageBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(`Falha ao carregar imagem para crítica: ${msg}`), { code: 'IMAGE_FETCH_ERROR' });
  }

  let raw = '';
  try {
    const t0 = Date.now();
    emit?.({ ts: Date.now(), level: "info", code: "llm.call",
      message: `${MODEL} · vision`,
      meta: { model: MODEL, slideN: params.slideN } });
    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 512,
      messages:   [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text',  text: buildCriticPrompt(params) },
        ],
      }],
    });
    raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');
    const usage = message.usage;
    const costUsd = estimateCost(MODEL, usage.input_tokens, usage.output_tokens);
    emit?.({ ts: Date.now(), level: "info", code: "llm.response",
      message: `${usage.output_tokens} tok · $${costUsd.toFixed(4)}`,
      meta: { model: MODEL, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd, latencyMs: Date.now() - t0 } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[runDirectorCritic] Anthropic error:', msg);
    throw Object.assign(new Error(`Falha na avaliação crítica: ${msg}`), { code: 'PROVIDER_ERROR', details: msg });
  }

  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  let parsed: DirectorCriticOutput | null = null;
  try { parsed = JSON.parse(stripped) as DirectorCriticOutput; } catch { /* continue */ }
  if (!parsed) {
    const f = raw.indexOf('{'), l = raw.lastIndexOf('}');
    if (f !== -1 && l > f) try { parsed = JSON.parse(raw.slice(f, l + 1)) as DirectorCriticOutput; } catch { /* continue */ }
  }

  if (!parsed || typeof parsed.score !== 'number') {
    throw Object.assign(
      new Error('Falha ao parsear resposta da crítica'),
      { code: 'PARSE_ERROR', details: raw.slice(0, 300) },
    );
  }

  emit?.({ ts: Date.now(), level: "info", code: "llm.parse",
    message: `score ${Math.min(10, Math.max(1, Math.round(parsed.score)))}`,
    meta: { score: parsed.score, notes: parsed.notes?.slice(0, 80) } });

  return { score: Math.min(10, Math.max(1, Math.round(parsed.score))), notes: parsed.notes ?? '' };
}
