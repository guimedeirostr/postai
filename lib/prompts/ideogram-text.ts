/**
 * lib/prompts/ideogram-text.ts
 *
 * Constrói prompts para o Ideogram v3 com tipografia nativa embutida.
 *
 * O Ideogram é único entre os modelos de imagem por renderizar texto
 * com qualidade tipográfica dentro da arte — sem precisar do compositor.
 * Ideal para posts onde o texto É parte do design visual (não sobreposto).
 *
 * Uso:
 *   - Quando `provider=ideogram_text` na geração
 *   - A arte final já contém headline + logo-text — não precisa de compositor
 *
 * Limitações:
 *   - Não suporta logo como imagem (apenas texto da marca)
 *   - O texto deve ter no máximo ~40 chars para manter qualidade
 *   - Langue-ptBR pode ter erros de ortografia ocasionais (re-verificar)
 */

import type { BrandProfile } from "@/types";
import type { StrategyBriefing } from "@/types";

interface IdeogramTextInput {
  client:         BrandProfile;
  headline:       string;          // visual_headline (máx 6 palavras, pt-BR)
  strategy?:      Partial<StrategyBriefing>;
  basePrompt:     string;          // visual_prompt do post (inglês, cena fotográfica)
  toneProfileName?: string;        // nome do tone_profile ativo (ex: "bold_aggressive")
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapa tone_profile → abordagem Ideogram
// ─────────────────────────────────────────────────────────────────────────────

interface IdeogramConfig {
  style_type:        "REALISTIC" | "DESIGN" | "RENDER_3D" | "ANIME";
  typography_desc:   string;   // descrição tipográfica em inglês para o prompt
  text_placement:    string;   // onde posicionar o texto
  magic_prompt:      "OFF";    // sempre OFF para garantir texto exato
}

const TONE_TO_IDEOGRAM: Record<string, IdeogramConfig> = {
  // ── Varejo impactante: faixa sólida colorida + texto branco all-caps ───────
  bold_aggressive: {
    style_type:      "DESIGN",
    typography_desc: "bold condensed black sans-serif typography all-caps, high contrast white text on solid red/black banner, Barlow Condensed or Oswald style, tight letter-spacing, thick font weight 900",
    text_placement:  "large bold text filling the top third of the image on a solid color banner",
    magic_prompt:    "OFF",
  },
  // ── Pop vibrante: tipografia colorida e energética ───────────────────────
  vibrant_pop: {
    style_type:      "DESIGN",
    typography_desc: "vibrant bold display typography, colorful gradient text or neon outlines, uppercase playful font weight 900, Anton or Bebas Neue style, strong visual energy",
    text_placement:  "large text centered with vibrant color contrast against the background",
    magic_prompt:    "OFF",
  },
  // ── Editorial limpo: tipografia elegante com muito espaço ────────────────
  editorial_clean: {
    style_type:      "DESIGN",
    typography_desc: "clean elegant sans-serif typography, medium weight 400-700, wide letter-spacing, minimal design with generous white space, Montserrat or Raleway style",
    text_placement:  "refined text in the lower third with clean alignment",
    magic_prompt:    "OFF",
  },
  // ── Luxo mínimo: serif leve e sofisticado ───────────────────────────────
  minimal_luxury: {
    style_type:      "DESIGN",
    typography_desc: "refined light serif typography, elegant thin weight 300, wide letter-spacing, luxury brand aesthetic, Cormorant Garamond or Playfair Display style, gold or cream colored text",
    text_placement:  "centered text with ample breathing room, in the lower portion",
    magic_prompt:    "OFF",
  },
  // ── Orgânico quente: lifestyle com texto integrado ──────────────────────
  warm_organic: {
    style_type:      "REALISTIC",
    typography_desc: "warm organic typography, semi-bold weight 600-700, natural serif or rounded sans-serif, Lora or Poppins style, warm cream or white text with subtle shadow",
    text_placement:  "text naturally integrated in the lower third over warm atmospheric background",
    magic_prompt:    "OFF",
  },
};

// Fallback para segmentos sem tone_profile
const SEGMENT_FALLBACK: Record<string, IdeogramConfig> = {
  retail: {
    style_type:      "DESIGN",
    typography_desc: "bold condensed uppercase typography, high contrast, red and white, impactful poster design",
    text_placement:  "large bold text in the top portion on a solid banner",
    magic_prompt:    "OFF",
  },
  gourmet: {
    style_type:      "REALISTIC",
    typography_desc: "elegant italic serif typography, gold or cream text, fine dining aesthetic, Cormorant Garamond style",
    text_placement:  "refined text overlay in the lower third",
    magic_prompt:    "OFF",
  },
  fitness: {
    style_type:      "DESIGN",
    typography_desc: "bold athletic uppercase typography, strong contrast, dynamic energy, Oswald or Barlow style",
    text_placement:  "impactful text centered with strong presence",
    magic_prompt:    "OFF",
  },
  luxe: {
    style_type:      "DESIGN",
    typography_desc: "refined thin serif typography, minimalist luxury aesthetic, wide letter-spacing",
    text_placement:  "centered minimal text with generous spacing",
    magic_prompt:    "OFF",
  },
  default: {
    style_type:      "DESIGN",
    typography_desc: "modern bold sans-serif typography, clean professional layout, Montserrat style",
    text_placement:  "in the lower third of the image",
    magic_prompt:    "OFF",
  },
};

function resolveIdeogramConfig(toneProfileName?: string, segment?: string): IdeogramConfig {
  // 1. tone_profile tem prioridade máxima
  if (toneProfileName && TONE_TO_IDEOGRAM[toneProfileName]) {
    return TONE_TO_IDEOGRAM[toneProfileName];
  }

  // 2. Fallback por segmento
  const seg = (segment ?? "").toLowerCase();
  if (/mercado|supermercado|varejo|empório|loja|açougue/.test(seg)) return SEGMENT_FALLBACK.retail;
  if (/restaurante|gourmet|gastro|culinária|café|bistrô|padaria/.test(seg)) return SEGMENT_FALLBACK.gourmet;
  if (/fit|academia|saúde|esport|nutrição/.test(seg)) return SEGMENT_FALLBACK.fitness;
  if (/luxo|premium|alta renda|imob|moda|joia|relógio/.test(seg)) return SEGMENT_FALLBACK.luxe;
  return SEGMENT_FALLBACK.default;
}

/**
 * Monta o prompt para Ideogram com o texto embutido na arte.
 *
 * Regras críticas do Ideogram v3:
 * 1. Texto entre aspas simples na descrição → renderizado como escrito
 * 2. magic_prompt_option="OFF" → impede o Ideogram de reescrever o prompt e alterar o texto
 * 3. style_type="DESIGN" → ativa o modo de design gráfico (tipografia como arte)
 * 4. style_type="REALISTIC" → mantém fotorrealismo para lifestyle + texto integrado
 */
export function buildIdeogramTextPrompt(input: IdeogramTextInput): {
  prompt:               string;
  negative_prompt:      string;
  style_type:           "REALISTIC" | "DESIGN" | "RENDER_3D" | "ANIME";
  magic_prompt_option:  "OFF";
} {
  const { client, headline, basePrompt, toneProfileName } = input;
  const config = resolveIdeogramConfig(toneProfileName, client.segment);

  // ── Limpar basePrompt de referências de texto ────────────────────────────
  // O visual_prompt às vezes contém "text overlay: X" ou "caption: X" que
  // conflitam com o texto que o Ideogram vai renderizar.
  // Removemos essas referências para evitar colisão de zonas de texto.
  const cleanBasePrompt = basePrompt
    .replace(/text overlay[^.]*\./gi, "")
    .replace(/caption[^.]*\./gi, "")
    .replace(/headline[^.]*\./gi, "")
    .replace(/logo[^.]*\./gi, "")
    .replace(/instagram handle[^.]*\./gi, "")
    .replace(/brand name[^.]*\./gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // ── Prompt limpo e focado — UMA zona de texto apenas ─────────────────────
  // CRÍTICO: não pedir logo, handle ou múltiplos textos.
  // O compositor vai sobrepor logo + handle APÓS o Ideogram gerar.
  // O Ideogram deve renderizar APENAS o visual_headline.
  const prompt = [
    cleanBasePrompt,
    `Professional Instagram post for Brazilian market.`,
    `ONE text element only, ${config.text_placement}:`,
    `"${headline}" — ${config.typography_desc}.`,
    `No other text, no logos, no handles, no brand names, no watermarks.`,
    `Background is clean and photographic. Text is the only graphic element.`,
    `High-end agency quality. Text reads EXACTLY: "${headline}". Zero spelling errors.`,
  ].join(" ");

  const negative_prompt = [
    "blurry text",
    "misspelled words",
    "unreadable typography",
    "distorted letters",
    "garbled text",
    "wrong spelling",
    "overlapping text",
    "multiple text blocks",
    "two headlines",
    "secondary text",
    "lorem ipsum",
    "watermark",
    "logo",
    "instagram handle",
    "ugly design",
    "low quality",
    "amateurish",
    "cluttered",
    "busy layout",
  ].join(", ");

  return {
    prompt,
    negative_prompt,
    style_type:          config.style_type,
    magic_prompt_option: config.magic_prompt,
  };
}
