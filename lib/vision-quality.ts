/**
 * lib/vision-quality.ts
 *
 * Vision Quality Gate — avalia imagens geradas por IA antes da composição.
 *
 * Usa Claude Vision (claude-sonnet-4-6) para verificar:
 *   - Espaço negativo adequado para overlay de texto (headline_ok)
 *   - Zona de contraste para posicionamento do logo (logo_ok)
 *   - Adequação da composição para redes sociais (composition_ok)
 *   - Score geral de qualidade (0–100)
 *
 * Política de falha segura: qualquer erro (fetch, API, parse) retorna um
 * resultado "passou" com score 70 — a geração nunca é bloqueada por falha
 * do quality gate.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Anthropic (singleton de módulo)
// ─────────────────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────────

export interface QualityResult {
  /** Score geral de qualidade 0–100 */
  score:           number;
  /** Explicação breve em pt-BR dos pontos fortes ou problemas encontrados */
  notes:           string;
  /** Há espaço negativo suficiente para o overlay de texto */
  headline_ok:     boolean;
  /** Há zona de contraste disponível para o logo */
  logo_ok:         boolean;
  /** Composição adequada para redes sociais (sem texto estranho, foco claro, nítida) */
  composition_ok:  boolean;
  /** true quando score >= 60 */
  passed:          boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado padrão de fallback (nunca bloqueia geração)
// ─────────────────────────────────────────────────────────────────────────────

const FALLBACK_RESULT: QualityResult = {
  score:           70,
  notes:           "Avaliação automática não disponível",
  headline_ok:     true,
  logo_ok:         true,
  composition_ok:  true,
  passed:          true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Deriva o content-type a partir da extensão da URL */
function contentTypeFromUrl(url: string): string {
  const lower = url.split("?")[0].toLowerCase();
  if (lower.endsWith(".png"))  return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif"))  return "image/gif";
  return "image/jpeg"; // padrão
}

/** Remove cercas de markdown antes de JSON.parse */
function stripMarkdownFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/im, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Avalia a qualidade de uma imagem gerada por IA antes da composição.
 *
 * @param imageUrl       URL pública da imagem a avaliar
 * @param visualHeadline Texto do headline que será sobreposto (máx 6 palavras)
 * @param primaryColor   Cor primária da marca em hex (ex: "#1A2B3C")
 *
 * @returns QualityResult com score, flags booleanas e notas em pt-BR
 */
export async function evaluateImageQuality(
  imageUrl:       string,
  visualHeadline: string,
  primaryColor:   string,
): Promise<QualityResult> {
  try {
    // ── 1. Buscar imagem e converter para base64 ──────────────────────────────
    const imageResponse = await fetch(imageUrl, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!imageResponse.ok) {
      console.warn(
        `[vision-quality] Fetch falhou ${imageResponse.status} — ${imageUrl}`,
      );
      return FALLBACK_RESULT;
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64      = Buffer.from(arrayBuffer).toString("base64");
    const mediaType   = contentTypeFromUrl(imageUrl) as
      | "image/jpeg"
      | "image/png"
      | "image/gif"
      | "image/webp";

    // ── 2. Montar system prompt para análise estruturada ─────────────────────
    const systemPrompt = `You are a visual quality inspector for social media posts. Analyze the image and return a JSON quality assessment.
The image will have a text overlay with headline: "${visualHeadline}" and a brand logo (color: ${primaryColor}).

Evaluate:
1. headline_ok: Is there sufficient negative space or a visually clean area where text can be overlaid legibly? (At least 30% of the image should be suitable for text)
2. logo_ok: Is there a corner or edge area with enough contrast to place a small logo?
3. composition_ok: Is the image visually engaging and suitable for social media? (No distorted faces, no existing text/watermarks, clear focal point, not blurry)
4. score: Overall quality score 0–100 considering all factors
5. notes: Brief explanation in Portuguese (pt-BR) of the main issues or strengths

Return only valid JSON:
{ "headline_ok": bool, "logo_ok": bool, "composition_ok": bool, "score": number, "notes": "string" }`;

    // ── 3. Chamar Claude Vision ───────────────────────────────────────────────
    const response = await anthropic.messages.create(
      {
        model:      "claude-sonnet-4-6",
        max_tokens: 256,
        system:     systemPrompt,
        messages: [
          {
            role:    "user",
            content: [
              {
                type:   "image",
                source: {
                  type:       "base64",
                  media_type: mediaType,
                  data:       base64,
                },
              },
              {
                type: "text",
                text: "Analyze this image and return the quality assessment JSON.",
              },
            ],
          },
        ],
      },
      { timeout: 20_000 },
    );

    // ── 4. Extrair texto da resposta ──────────────────────────────────────────
    const raw = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map(block => block.text)
      .join("");

    // ── 5. Parse do JSON (strip fences antes) ─────────────────────────────────
    const clean = stripMarkdownFences(raw);

    interface RawQuality {
      headline_ok:    boolean;
      logo_ok:        boolean;
      composition_ok: boolean;
      score:          number;
      notes:          string;
    }

    const parsed = JSON.parse(clean) as RawQuality;

    // ── 6. Validação mínima e normalização ────────────────────────────────────
    const score = typeof parsed.score === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.score)))
      : 70;

    const result: QualityResult = {
      score,
      notes:           typeof parsed.notes          === "string"  ? parsed.notes          : "Sem notas",
      headline_ok:     typeof parsed.headline_ok    === "boolean" ? parsed.headline_ok    : true,
      logo_ok:         typeof parsed.logo_ok        === "boolean" ? parsed.logo_ok        : true,
      composition_ok:  typeof parsed.composition_ok === "boolean" ? parsed.composition_ok : true,
      passed:          score >= 60,
    };

    console.log(
      `[vision-quality] score=${result.score} passed=${result.passed}`,
      `headline_ok=${result.headline_ok} logo_ok=${result.logo_ok}`,
      `composition_ok=${result.composition_ok}`,
    );

    return result;

  } catch (err) {
    // ── 7. Fallback seguro — nunca bloqueia geração ───────────────────────────
    console.warn("[vision-quality] Avaliação falhou (non-fatal, usando fallback):", err);
    return FALLBACK_RESULT;
  }
}
