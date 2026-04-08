/**
 * lib/visual-perception.ts
 *
 * Agente de Percepção Visual — diretor de arte sênior simulado via Claude Vision.
 *
 * Diferença fundamental vs. art-direction-engine.ts:
 *   - engine.ts:     análise de pixels (Sharp) → heurística mecânica
 *   - perception.ts: Claude olha a imagem → raciocínio estético contextual
 *
 * O agente decide:
 *   - De onde vem a luz → onde O TEXTO NÃO compete com a iluminação
 *   - Qual cor da imagem pode ser usada como ELEMENTO DE DESIGN, não só fundo
 *   - Qual o mínimo de overlay necessário (não destrói a foto por precaução)
 *   - Peso tipográfico ideal para aquela imagem específica
 *
 * Uso: chamado no path library_direct do generate-image, após analyzeImage()
 * e antes de composePost(). O retorno é mergeado no LayerStack.
 *
 * Custo: ~$0.003–0.005/imagem com claude-haiku (imagem + ~300 tokens de saída).
 * Timeout: 8s — se falhar, o pipeline continua com o LayerStack original.
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildVisualPerceptionPrompt } from "@/lib/prompts/visual-perception";
import type { BrandProfile, LayerStack, WashDecision } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export interface VisualPerception {
  light_source:        "left" | "right" | "top" | "bottom" | "even" | "backlit";
  subject_region:      "left" | "right" | "center" | "top" | "bottom" | "full-frame";
  safe_text_zone:      "top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-full" | "bottom-full";
  wash_recommendation: "none" | "subtle-gradient" | "medium-gradient" | "strong-gradient" | "frosted-band";
  accent_color:        string;
  use_accent_for:      "headline-color" | "underline-accent" | "background-element" | "none";
  typography_weight:   "light" | "regular" | "bold" | "black";
  composition_tension: "diagonal-left" | "diagonal-right" | "vertical" | "horizontal" | "circular" | "none";
  rationale:           string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agente principal
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

/**
 * Chama Claude Vision para analisar a imagem como um diretor de arte.
 *
 * @param imageUrl  URL pública da foto (R2, Firebase Storage, Freepik)
 * @param headline  Texto do headline que será sobreposto
 * @param client    Perfil da marca (para contexto de tom e cor)
 * @returns VisualPerception ou null se falhar
 */
export async function runVisualPerception(
  imageUrl: string,
  headline: string,
  client:   BrandProfile,
): Promise<VisualPerception | null> {
  try {
    const prompt = buildVisualPerceptionPrompt(headline, client);

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 512,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "url", url: imageUrl },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      }],
    }, { timeout: 8_000 });

    const raw = response.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip markdown fences
    const clean = raw.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();

    const parsed = JSON.parse(clean) as VisualPerception;

    console.log(`[visual-perception] light=${parsed.light_source} zone=${parsed.safe_text_zone} wash=${parsed.wash_recommendation} accent=${parsed.accent_color}`);

    return parsed;
  } catch (e) {
    console.warn("[visual-perception] Claude Vision falhou (non-fatal):", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplicador: merge VisualPerception → LayerStack
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aplica as decisões estéticas do agente de percepção ao LayerStack existente.
 *
 * Sobrescreve campos específicos do LayerStack com base na percepção visual.
 * Os campos não tocados pelo agente permanecem com os valores do engine.
 */
export function applyPerceptionToLayerStack(
  stack:      LayerStack,
  perception: VisualPerception,
  client:     BrandProfile,
): LayerStack {
  const result = { ...stack };

  // ── 1. Wash: substituir pela recomendação do agente ───────────────────────
  const primaryColor = client.primary_color ?? "#000000";
  const washMap: Record<VisualPerception["wash_recommendation"], WashDecision> = {
    "none":             { type: "none" },
    "subtle-gradient":  { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.30, color: "#000000" },
    "medium-gradient":  { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.50, color: "#000000" },
    "strong-gradient":  { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.70, color: "#000000" },
    "frosted-band":     { type: "solid_band", position: "bottom", height_percent: 38, color: primaryColor, opacity: 0.88 },
  };
  result.wash = washMap[perception.wash_recommendation];

  // ── 2. Zona de texto: mapear safe_text_zone → text_zone ──────────────────
  // TextZone usa `anchor` (não `position`), e os campos são width_percent,
  // height_percent, padding, safe_margin.
  const zoneMap: Record<VisualPerception["safe_text_zone"], LayerStack["text_zone"]> = {
    "top-left":     { anchor: "top-left",     width_percent: 85, height_percent: 30, padding: 40, safe_margin: true },
    "top-right":    { anchor: "top-right",    width_percent: 85, height_percent: 30, padding: 40, safe_margin: true },
    "bottom-left":  { anchor: "bottom-left",  width_percent: 85, height_percent: 35, padding: 40, safe_margin: true },
    "bottom-right": { anchor: "bottom-right", width_percent: 85, height_percent: 35, padding: 40, safe_margin: true },
    "top-full":     { anchor: "top-full",     width_percent: 92, height_percent: 30, padding: 32, safe_margin: true },
    "bottom-full":  { anchor: "bottom-full",  width_percent: 92, height_percent: 35, padding: 32, safe_margin: true },
  };
  result.text_zone = zoneMap[perception.safe_text_zone] ?? result.text_zone;

  // ── 3. Tipografia: peso baseado na percepção ──────────────────────────────
  // HeadlineParams usa `font_weight` (não `weight`).
  const weightMap: Record<VisualPerception["typography_weight"], LayerStack["headline"]["font_weight"]> = {
    "light":   "400",
    "regular": "400",
    "bold":    "700",
    "black":   "900",
  };
  result.headline = {
    ...result.headline,
    font_weight: weightMap[perception.typography_weight] ?? result.headline.font_weight,
  };

  // ── 4. Cor de acento: injeta no headline se "headline-color" ─────────────
  if (perception.use_accent_for === "headline-color" && perception.accent_color) {
    result.headline = { ...result.headline, color: perception.accent_color };
  }

  // ── 5. Log do rationale para diagnóstico ─────────────────────────────────
  console.log(`[visual-perception/rationale] ${perception.rationale}`);

  return result;
}
