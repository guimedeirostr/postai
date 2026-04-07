/**
 * lib/composer/color-mood.ts
 *
 * Resolve a cor de tint do gradiente do compositor a partir de uma descrição
 * textual de mood (ex: "dark moody with warm amber brand accents").
 *
 * O compositor usa isso para colorir o gradiente sem perder a identidade da
 * marca — a strip inferior sólida continua usando `primaryColor` (ancora de
 * brand), mas o gradient pode respeitar o clima visual da referência.
 *
 * Estratégia:
 *   1. Varre a descrição por palavras-chave de cor (em pt-BR e EN)
 *   2. Mapeia pra um hex de referência
 *   3. Se o mood indicar "dark/escuro", retorna preto puro
 *   4. Se nada bater, retorna a `primaryColor` da marca (fallback seguro)
 */

// ── Palette: nome → hex ──────────────────────────────────────────────────────

interface ColorEntry {
  patterns: RegExp[];
  hex:      string;
}

/**
 * Tabela de cores reconhecidas. Ordem importa — matches mais específicos
 * primeiro (ex: "deep amber" antes de "amber").
 */
const COLOR_TABLE: ColorEntry[] = [
  // ── Dark / moody (prioridade alta) ──────────────────────────────────────
  { patterns: [/\b(pitch\s*black|pure\s*black|jet\s*black|preto\s*puro)\b/i], hex: "#000000" },
  { patterns: [/\b(dark|moody|noir|escur|sombri)/i],                          hex: "#0a0a0a" },

  // ── Warm earth tones ────────────────────────────────────────────────────
  { patterns: [/\b(amber|âmbar|ambar|honey|mel)\b/i],              hex: "#b8751c" },
  { patterns: [/\b(caramel|caramelo|toffee)\b/i],                  hex: "#8b5a2b" },
  { patterns: [/\b(terracotta|terra[- ]?cotta|brick|tijolo)\b/i],  hex: "#a0522d" },
  { patterns: [/\b(rust|ferrugem)\b/i],                            hex: "#9c4a1a" },
  { patterns: [/\b(earth|earthy|terra|terroso)\b/i],               hex: "#6b4423" },
  { patterns: [/\b(warm\s*brown|marrom\s*quente|chocolate)\b/i],   hex: "#4a2c1a" },
  { patterns: [/\b(wood|wooden|madeira|rustic|r[úu]stic)/i],       hex: "#3d2818" },

  // ── Golds and yellows ───────────────────────────────────────────────────
  { patterns: [/\b(gold|dourad|golden)\b/i],                       hex: "#c9a227" },
  { patterns: [/\b(mustard|mostarda)\b/i],                         hex: "#b8a017" },
  { patterns: [/\b(cream|creme|ivory|marfim)\b/i],                 hex: "#f5e6c8" },

  // ── Cool tones ──────────────────────────────────────────────────────────
  { patterns: [/\b(navy|marinho|deep\s*blue)\b/i],                 hex: "#0b2545" },
  { patterns: [/\b(royal\s*blue|azul\s*royal)\b/i],                hex: "#1d3a8a" },
  { patterns: [/\b(teal|turquesa|turquoise)\b/i],                  hex: "#0f766e" },
  { patterns: [/\b(emerald|esmeralda|forest\s*green)\b/i],         hex: "#064e3b" },
  { patterns: [/\b(sage|sage\s*green|verde\s*sage)\b/i],           hex: "#6b8e4e" },
  { patterns: [/\b(mint|menta)\b/i],                               hex: "#7fc7a8" },

  // ── Reds / pinks ────────────────────────────────────────────────────────
  { patterns: [/\b(burgundy|wine|vinho|bord[ôo]|claret)\b/i],      hex: "#5a1a2b" },
  { patterns: [/\b(blush|rosa\s*pastel|peach|p[êe]ssego)\b/i],     hex: "#f4c2a1" },
  { patterns: [/\b(coral)\b/i],                                    hex: "#e8705c" },
  { patterns: [/\b(crimson|carmesim)\b/i],                         hex: "#990d24" },

  // ── Neutrals ────────────────────────────────────────────────────────────
  { patterns: [/\b(cool\s*gray|cinza\s*frio|slate)\b/i],           hex: "#334155" },
  { patterns: [/\b(warm\s*gray|cinza\s*quente|taupe)\b/i],         hex: "#605448" },
  { patterns: [/\b(pure\s*white|branco\s*puro|bright\s*white)\b/i],hex: "#ffffff" },

  // ── Vibrant / high-contrast ─────────────────────────────────────────────
  { patterns: [/\b(neon|electric|vibrante\s*forte)\b/i],           hex: "#00e5ff" },
  { patterns: [/\b(magenta|fuchsia|f[úu]csia)\b/i],                hex: "#c026d3" },
];

/**
 * Resolve a cor do gradiente a partir de uma descrição de mood + fallback
 * da cor primária da marca.
 *
 * @param colorMood     Descrição textual (reference_dna.color_mood ou brand_dna.color_treatment)
 * @param primaryColor  Hex da cor primária da marca (fallback quando mood é vazio/irreconhecível)
 */
export function resolveGradientColor(
  colorMood?:   string | null,
  primaryColor?: string | null,
): string {
  const fallback = ensureHex(primaryColor ?? "#6d28d9");
  if (!colorMood) return fallback;

  const normalized = colorMood.trim();
  if (!normalized) return fallback;

  for (const entry of COLOR_TABLE) {
    if (entry.patterns.some(rx => rx.test(normalized))) {
      return entry.hex;
    }
  }
  return fallback;
}

/**
 * Detecta se o mood indica uma referência "escura" — útil para o compositor
 * decidir se aumenta a opacidade do gradient ou se usa preto puro no lugar
 * da cor da marca.
 */
export function isDarkMood(colorMood?: string | null): boolean {
  if (!colorMood) return false;
  return /\b(dark|moody|noir|escur|sombri|black|preto|night|noite|midnight)/i.test(colorMood);
}

function ensureHex(color: string): string {
  if (!color) return "#6d28d9";
  return color.startsWith("#") ? color : `#${color}`;
}
