/**
 * lib/prompt-compiler.ts
 *
 * Traduz o JSON estruturado do ArtDirection em prompts de texto otimizados
 * por provider. Cada API de geração de imagem tem quirks diferentes — este
 * módulo garante que o output do Art Director seja maximamente efetivo.
 *
 * Providers suportados:
 *   fal / fal_pulid / fal_canny / fal_depth
 *         → Flux Pro (texto fluido, style tags no final, negativo embutido)
 *   freepik / seedream / seedream_edit
 *         → Mystic/Seedream (fotográfico, cores via API styling separada)
 *   imagen4
 *         → Google Imagen 4 (conciso, máx ~480 tokens, sem campo negativo)
 */

import type { ArtDirection, BrandProfile } from "@/types";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ImageProvider =
  | "fal"
  | "fal_pulid"
  | "fal_canny"
  | "fal_depth"
  | "freepik"
  | "seedream"
  | "seedream_edit"
  | "imagen4";

export interface CompiledPrompt {
  /** Prompt positivo completo — sempre em inglês */
  positive: string;
  /** Termos negativos normalizados */
  negative: string;
  /**
   * String final pronta para envio à API do provider.
   * - Flux:    positivo + "Avoid: X, Y, Z." embutido no final
   * - Freepik: apenas positivo (negativo descartado — sem campo nativo)
   * - Imagen:  positivo trimado ao limite de tokens
   */
  final: string;
}

// ── Flux / FAL.ai ─────────────────────────────────────────────────────────────

/**
 * Flux (FLUX.1 Pro, Schnell, Dev) responde melhor a:
 * - Descrições cinematográficas ricas e fluidas
 * - Metadados de câmera/lente explícitos
 * - Tags de estilo no final do prompt
 * - Negativos embutidos como ", Avoid: x, y, z" (sem campo nativo)
 */
export function compileForFlux(
  art:   ArtDirection,
  brand: BrandProfile
): CompiledPrompt {
  const parts: string[] = [];

  // Base: final_visual_prompt já tem 80-200 palavras do Art Director
  parts.push(art.final_visual_prompt.trim());

  // Câmera: adiciona se não mencionado no prompt base
  const hasLens = /\d+\s*mm|prime lens|telephoto|wide.?angle|macro/i
    .test(art.final_visual_prompt);
  if (!hasLens && art.lens) {
    parts.push(`Captured with ${art.lens}, ${art.depth_of_field}.`);
  }

  // Reforço de estilo — Flux responde bem a estes no final
  if (art.texture)      parts.push(`Texture: ${art.texture}.`);
  if (art.visual_style) parts.push(`Style: ${art.visual_style}.`);
  if (art.emotion)      parts.push(`Mood: ${art.emotion}.`);

  // Boosters de qualidade Flux
  parts.push(
    "Cinematic quality, ultra-detailed, sharp focus, professional photography, 8K resolution."
  );

  const positive = parts.join(" ").trim();
  const negative = buildNegative(art.negative_prompt);

  // Flux não tem campo negative_prompt nativo — embutir no final
  const final = negative
    ? `${positive} Avoid: ${negative}.`
    : positive;

  return { positive, negative, final };
}

// ── Freepik Mystic / Seedream ─────────────────────────────────────────────────

/**
 * Freepik (Mystic & Seedream) é treinado em captions fotográficas.
 * - Usa o final_visual_prompt diretamente
 * - Cores da marca são enviadas via parâmetro `styling` da API (separado)
 * - Sem suporte a negative_prompt no contrato atual
 */
export function compileForFreepik(
  art:   ArtDirection,
  brand: BrandProfile
): CompiledPrompt {
  const positive = art.final_visual_prompt.trim();
  const negative = buildNegative(art.negative_prompt);

  // Freepik: negativos não embutidos (sem campo nativo na integração atual)
  return { positive, negative, final: positive };
}

// ── Google Imagen 4 ───────────────────────────────────────────────────────────

/**
 * Imagen 4 tem limite rígido de ~480 tokens (≈ 360 palavras / ~1800 chars).
 * - Prioriza sujeito, iluminação e estilo
 * - Conciso mas específico
 * - Sem suporte a negative_prompt
 */
export function compileForImagen(
  art:   ArtDirection,
  brand: BrandProfile
): CompiledPrompt {
  const core = art.final_visual_prompt.trim();

  // Trunca com segurança no limite de tokens
  const trimmed = core.length > 1500
    ? core.slice(0, 1500).trimEnd() + "..."
    : core;

  // Sufixo conciso de estilo — Imagen responde bem
  const styleSuffix = [art.visual_style, art.lighting, art.emotion]
    .filter(Boolean)
    .join(", ");

  const positive = styleSuffix
    ? `${trimmed} ${styleSuffix}.`
    : trimmed;

  const negative = buildNegative(art.negative_prompt);

  // Imagen: sem campo negative_prompt → omitir do final
  return { positive, negative, final: positive };
}

// ── Roteador inteligente ──────────────────────────────────────────────────────

/**
 * Retorna o prompt compilado otimizado para o provider ativo.
 * Ponto de entrada principal — use este nas rotas.
 */
export function compilePromptForProvider(
  provider: ImageProvider,
  art:      ArtDirection,
  brand:    BrandProfile
): CompiledPrompt {
  switch (provider) {
    case "fal":
    case "fal_pulid":
    case "fal_canny":
    case "fal_depth":
      return compileForFlux(art, brand);

    case "imagen4":
      return compileForImagen(art, brand);

    case "freepik":
    case "seedream":
    case "seedream_edit":
    default:
      return compileForFreepik(art, brand);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normaliza o campo negative_prompt do ArtDirection.
 * Claude às vezes retorna string, às vezes frase — normalizamos aqui.
 * Sempre garante baseline de qualidade mínima.
 */
function buildNegative(raw: string | undefined): string {
  const baseline =
    "low quality, blurry, pixelated, watermark, text on image, logo on image, " +
    "distorted anatomy, oversaturated colors, generic stock photo, plastic skin, " +
    "airbrushed texture, ugly, deformed";

  if (!raw || raw.trim().length === 0) return baseline;

  const trimmed = raw.trim();

  // Evita duplicação do baseline
  if (/low.?quality/i.test(trimmed)) return trimmed;

  return `${trimmed}, ${baseline}`;
}
