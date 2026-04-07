/**
 * lib/composer/typography.ts
 *
 * Resolve o estilo tipográfico do headline a partir dos sinais de DNA:
 *   • reference_dna.visual_headline_style  (Stage 0 — descrição da referência)
 *   • brand_dna.typography_pattern         (síntese de N posts da marca)
 *
 * Retorna a fonte, peso, caixa, espaçamento e cor secundária a aplicar.
 *
 * Famílias suportadas:
 *   montserrat-black  → modern, bold, energético       (DEFAULT)
 *   playfair-display  → editorial, serif, elegante
 *   dancing-script    → handwritten, script, artesanal
 *   inter-medium      → minimal, clean, sans-serif moderno
 */

export type FontFamily =
  | "montserrat-black"
  | "playfair-display"
  | "dancing-script"
  | "inter-medium";

export type TextCase = "upper" | "title" | "as-is";

export interface TypographyStyle {
  family:        FontFamily;
  /** Nome usado pelo satori (deve bater com o registrado em ensureFonts) */
  satoriName:    string;
  weight:        number;
  case:          TextCase;
  /** Espaçamento entre letras em px (negativo = mais apertado) */
  letterSpacing: number;
  italic:        boolean;
  /** Multiplicador relativo ao tamanho default (1.0 = igual a Montserrat Black) */
  sizeFactor:    number;
  /** lineHeight relativo ao fontSize */
  lineHeight:    number;
}

const SCRIPT_PATTERNS  = /\b(script|handwritten|hand[- ]written|cursive|brush|calligraph|lettering|signature|hand[- ]drawn)\b/i;
const SERIF_PATTERNS   = /\b(serif|playfair|elegant|editorial|classic|cl[áa]ssic|sofistic|luxur|luxo|fine[- ]dining|gourmet|vintage|requintad|refinad)\b/i;
const MINIMAL_PATTERNS = /\b(minimal|minimalist|clean|modern[- ]sans|geometric|sans[- ]serif|simples|limpo)\b/i;
const ITALIC_PATTERNS  = /\b(italic|it[áa]lic|oblique|slanted|tilted)\b/i;
const TITLE_CASE_HINT  = /\b(title[- ]case|capitalized|first[- ]letter|primeira[- ]mai[úu]scula)\b/i;
const LOWER_CASE_HINT  = /\b(lowercase|lower[- ]case|min[úu]scul)\b/i;
const UPPER_CASE_HINT  = /\b(uppercase|upper[- ]case|all[- ]caps|caixa[- ]alta|mai[úu]scul)\b/i;

/**
 * Resolve o estilo tipográfico final a partir dos sinais disponíveis.
 *
 * Cascade de prioridade:
 *   1. headlineStyle  (reference_dna.visual_headline_style — mais específico)
 *   2. brandPattern   (brand_dna.typography_pattern)
 *   3. default        (Montserrat Black uppercase)
 */
export function resolveTypography(
  headlineStyle?: string | null,
  brandPattern?:  string | null,
): TypographyStyle {
  const signal = `${headlineStyle ?? ""} ${brandPattern ?? ""}`.trim();

  // ── Detecção de família ────────────────────────────────────────────────────
  if (signal && SCRIPT_PATTERNS.test(signal)) {
    return {
      family:        "dancing-script",
      satoriName:    "DancingScript",
      weight:        700,
      case:          resolveCase(signal, "title"),
      letterSpacing: 0,
      italic:        false,
      sizeFactor:    1.20,   // script precisa um pouco maior para leitura
      lineHeight:    1.10,
    };
  }

  if (signal && SERIF_PATTERNS.test(signal)) {
    return {
      family:        "playfair-display",
      satoriName:    "PlayfairDisplay",
      weight:        700,
      case:          resolveCase(signal, "title"),
      letterSpacing: 0,
      italic:        ITALIC_PATTERNS.test(signal),
      sizeFactor:    1.05,
      lineHeight:    1.08,
    };
  }

  if (signal && MINIMAL_PATTERNS.test(signal)) {
    return {
      family:        "inter-medium",
      satoriName:    "Inter",
      weight:        500,
      case:          resolveCase(signal, "as-is"),
      letterSpacing: 0.5,
      italic:        false,
      sizeFactor:    0.92,
      lineHeight:    1.10,
    };
  }

  // Default: Montserrat Black (estilo moderno bold)
  return {
    family:        "montserrat-black",
    satoriName:    "Montserrat",
    weight:        900,
    case:          resolveCase(signal, "upper"),
    letterSpacing: -2,
    italic:        false,
    sizeFactor:    1.00,
    lineHeight:    1.05,
  };
}

function resolveCase(signal: string, fallback: TextCase): TextCase {
  if (UPPER_CASE_HINT.test(signal)) return "upper";
  if (LOWER_CASE_HINT.test(signal)) return "as-is";
  if (TITLE_CASE_HINT.test(signal)) return "title";
  return fallback;
}

/** Aplica a transformação de caixa ao texto */
export function applyCase(text: string, c: TextCase): string {
  const trimmed = text.trim();
  if (c === "upper") return trimmed.toUpperCase();
  if (c === "title") {
    return trimmed
      .toLowerCase()
      .replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  }
  return trimmed;
}

/**
 * Divide o headline em até 2 linhas, respeitando a caixa configurada.
 * Palavras ≤ 3 → 1 linha; mais → divide ao meio.
 */
export function splitHeadlineForStyle(
  text: string,
  style: TypographyStyle,
): [string, string] {
  const cased = applyCase(text, style.case);
  const words = cased.split(/\s+/).filter(Boolean);
  if (words.length <= 3) return [words.join(" "), ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}
