import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import type { BrandProfile, PlanoDePost } from "@/types";
import { estimateCost } from "@/lib/canvas/trace";
import type { TraceEmitter } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const CAROUSEL_FORMATS = new Set(['ig_carousel', 'li_carousel_pdf', 'carousel']);

export interface CopySlide {
  n: number;
  role: 'capa' | 'pagina';
  headline: string;
  body: string;
  cta?: string;
}

export interface CopySingleOutput {
  headline: string;
  caption: string;
  cta: string;
  hashtags?: string[];
}

export interface CopyCarouselOutput {
  caption: string;
  cta: string;
  slides: CopySlide[];
}

export type DirectorCopyOutput = CopySingleOutput | CopyCarouselOutput;

export function isCopyCarousel(out: DirectorCopyOutput): out is CopyCarouselOutput {
  return 'slides' in out && Array.isArray((out as CopyCarouselOutput).slides);
}

export interface DirectorCopyParams {
  uid: string;
  clientId: string;
  objetivo: string;
  formato: string;
  plan?: PlanoDePost;
  emit?: TraceEmitter;
}

function buildSinglePrompt(client: BrandProfile, objetivo: string, formato: string, plan?: PlanoDePost): string {
  const tomVoz = plan?.tomVoz?.join(', ') ?? client.tone_of_voice;
  return `Você é um copywriter sênior especialista em redes sociais para o mercado brasileiro.

MARCA: ${client.name}
Segmento: ${client.segment}
Público-alvo: ${client.target_audience}
Tom de voz: ${tomVoz}
${plan?.publico ? `Público específico: ${plan.publico}` : ''}
${plan?.bigIdea ? `Big Idea: ${plan.bigIdea}` : ''}
${client.keywords?.length ? `Keywords: ${client.keywords.join(', ')}` : ''}
${client.avoid_words?.length ? `NUNCA use: ${client.avoid_words.join(', ')}` : ''}

TAREFA: Criar copy para um post de ${formato}.
Objetivo: ${objetivo}

Retorne APENAS JSON puro (sem markdown fences, sem texto antes ou depois):
{
  "headline": "título de impacto — máximo 6 palavras",
  "caption": "legenda completa com emojis e quebras de parágrafo",
  "cta": "chamada para ação objetiva",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;
}

function buildCarouselPrompt(client: BrandProfile, objetivo: string, plan?: PlanoDePost): string {
  const slides = plan?.slidesBriefing ?? [];
  const tomVoz = plan?.tomVoz?.join(', ') ?? client.tone_of_voice;
  const slideList = slides
    .map(s => `  Slide ${s.n} (${s.intencao}): ${s.copy}`)
    .join('\n');

  return `Você é um copywriter sênior especialista em carrosséis para Instagram e LinkedIn.

MARCA: ${client.name}
Segmento: ${client.segment}
Público-alvo: ${client.target_audience}
Tom de voz: ${tomVoz}
${plan?.bigIdea ? `Big Idea: ${plan.bigIdea}` : ''}
${client.avoid_words?.length ? `NUNCA use: ${client.avoid_words.join(', ')}` : ''}

ESTRUTURA DO CARROSSEL (${slides.length} slides):
${slideList || '  (sem briefing de slides — criar narrativa coerente)'}

Regras:
- Slide 1 = Capa: headline forte que para o scroll (máx 6 palavras). Desperta curiosidade.
- Slides internos = Página: headline conciso (máx 5 palavras) + body de 2–3 frases que desenvolvem o conteúdo.
- Último slide = inclua CTA claro e direto.
- Manter narrativa progressiva e coerente entre slides.
- headline = texto de overlay sobre a imagem (máx 6 palavras, impacto visual).
- body = conteúdo legível do slide (2–4 frases curtas, leitura fácil no celular).

Objetivo: ${objetivo}

Retorne APENAS JSON puro (sem markdown fences, sem texto antes ou depois):
{
  "caption": "legenda geral do post para o feed (com emojis, máx 300 chars)",
  "cta": "call-to-action do último slide",
  "slides": [
    { "n": 1, "role": "capa", "headline": "...", "body": "...", "cta": "arrasta pra ver →" },
    { "n": 2, "role": "pagina", "headline": "...", "body": "..." }
  ]
}`;
}

function parseJson<T>(raw: string): T | null {
  const stripped = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
  try { return JSON.parse(stripped) as T; } catch { /* continue */ }
  const f = raw.indexOf('{'), l = raw.lastIndexOf('}');
  if (f !== -1 && l > f) try { return JSON.parse(raw.slice(f, l + 1)) as T; } catch { /* continue */ }
  return null;
}

export async function runDirectorCopy(params: DirectorCopyParams): Promise<DirectorCopyOutput> {
  const { uid, clientId, objetivo, formato, plan, emit } = params;

  const clientSnap = await adminDb.collection('clients').doc(clientId).get();
  if (!clientSnap.exists || clientSnap.data()?.agency_id !== uid) {
    throw Object.assign(new Error('Cliente não encontrado'), { code: 'NOT_FOUND' });
  }
  const client = { id: clientSnap.id, ...clientSnap.data() } as BrandProfile;

  const isCarousel = CAROUSEL_FORMATS.has(formato);
  const systemPrompt = isCarousel
    ? buildCarouselPrompt(client, objetivo, plan)
    : buildSinglePrompt(client, objetivo, formato, plan);

  let raw = '';
  try {
    const t0 = Date.now();
    emit?.({ ts: Date.now(), level: "info", code: "llm.call",
      message: MODEL,
      meta: { model: MODEL, formato, isCarousel } });
    const message = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: `Gere o copy. Objetivo: ${objetivo}` }],
    });
    raw = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');
    const usage = message.usage;
    const costUsd = estimateCost(MODEL, usage.input_tokens, usage.output_tokens);
    emit?.({ ts: Date.now(), level: "info", code: "llm.response",
      message: `${usage.output_tokens} tok out · $${costUsd.toFixed(4)}`,
      meta: { model: MODEL, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd, latencyMs: Date.now() - t0 } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[runDirectorCopy] Anthropic error:', msg);
    throw Object.assign(new Error(`Falha na geração de copy: ${msg}`), { code: 'PROVIDER_ERROR', details: msg });
  }

  const parsed = parseJson<DirectorCopyOutput>(raw);
  if (parsed) {
    emit?.({ ts: Date.now(), level: "info", code: "llm.parse",
      message: "JSON parsed",
      meta: { keys: Object.keys(parsed) } });
  }
  if (!parsed) {
    console.error('[runDirectorCopy] JSON parse failed. Raw:', raw.slice(0, 400));
    throw Object.assign(
      new Error('Falha ao parsear resposta do modelo'),
      { code: 'PARSE_ERROR', details: raw.slice(0, 300) },
    );
  }
  return parsed;
}
