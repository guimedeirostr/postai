/**
 * lib/art-direction-engine.ts
 *
 * Motor de decisão de direção de arte — lógica de silkscreen.
 *
 * Recebe BackgroundAnalysis (percepção da cena via Claude Vision) +
 * ToneProfile (direção criativa baseada na marca) + BrandProfile (identidade)
 * e deriva cada camada da pilha de composição de baixo para cima,
 * sem depender de texto livre gerado pela IA para decisões mecânicas.
 *
 * Fluxo:
 *   Claude Vision    → BackgroundAnalysis  (percepção objetiva da cena)
 *   Claude Creative  → ToneProfile         (direção artística da marca)
 *   composeLayerStack() → LayerStack       (este arquivo — TypeScript puro)
 *   validateLayerStack() → ArtDirectionValidation + auto-fix
 *   layerStackToLayoutPrompt() → string    (para img2img)
 */

import type {
  BackgroundAnalysis,
  ToneProfile,
  WashDecision,
  TextZone,
  HeadlineParams,
  BrandElementsPlacement,
  LayerStack,
  ArtDirectionValidation,
  BrandProfile,
  LogoPlacement,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// TONE PROFILES — modos de direção de arte parametrizados
// Cada perfil define o comportamento padrão de todas as camadas.
// ─────────────────────────────────────────────────────────────────────────────

export const TONE_PROFILES: Record<string, ToneProfile> = {
  editorial_clean: {
    name:           "editorial_clean",
    typography:     { weight: "bold",  spacing: "wide",   case_style: "titlecase" },
    color_behavior: { contrast: "medium", saturation: "muted"   },
    composition:    { density: "minimal",  alignment: "left"      },
    wash_preference: "none",
  },
  bold_aggressive: {
    name:           "bold_aggressive",
    typography:     { weight: "black", spacing: "tight",  case_style: "uppercase" },
    color_behavior: { contrast: "high",   saturation: "vibrant" },
    composition:    { density: "dense",    alignment: "left"      },
    wash_preference: "strong",
  },
  minimal_luxury: {
    name:           "minimal_luxury",
    typography:     { weight: "light", spacing: "wide",   case_style: "sentence"  },
    color_behavior: { contrast: "low",    saturation: "muted"   },
    composition:    { density: "minimal",  alignment: "centered"  },
    wash_preference: "soft",
  },
  warm_organic: {
    name:           "warm_organic",
    typography:     { weight: "bold",  spacing: "normal", case_style: "sentence"  },
    color_behavior: { contrast: "medium", saturation: "natural" },
    composition:    { density: "balanced", alignment: "left"      },
    wash_preference: "soft",
  },
  vibrant_pop: {
    name:           "vibrant_pop",
    typography:     { weight: "black", spacing: "tight",  case_style: "uppercase" },
    color_behavior: { contrast: "high",   saturation: "vibrant" },
    composition:    { density: "dense",    alignment: "centered"  },
    wash_preference: "strong",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — WASH DECISION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide o tipo de wash (sobreposição de cor/gradiente) com base na
 * análise do fundo + perfil de tom da marca.
 *
 * Prioridade de decisão:
 *   1. Tom pede "none" + entropia baixa           → none
 *   2. Fundo muito poluído (entropy > 0.7)        → gradiente escuro obrigatório
 *   3. Zona inferior clara onde texto irá         → gradiente de legibilidade
 *   4. Luxury ou editorial com fundo razoável     → vignette suave ou none
 *   5. Bold / aggressive                          → faixa sólida da cor da marca
 *   6. Default                                    → gradiente suave
 */
export function decideWash(
  bg:         BackgroundAnalysis,
  tone:       ToneProfile,
  brandColor: string,
): WashDecision {
  // 1. Tom prefere limpo + fundo não polui → sem wash
  if (tone.wash_preference === "none" && bg.entropy_level < 0.45) {
    return { type: "none" };
  }

  // 2. Fundo muito poluído → gradiente escuro para legibilidade do texto
  if (bg.entropy_level > 0.7) {
    const toOpacity = tone.wash_preference === "strong" ? 0.65 : 0.45;
    return { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: toOpacity, color: "#000000" };
  }

  // 3. Zona inferior clara (onde o texto vai) → gradiente de legibilidade
  if (bg.brightness_zones.bottom === "light" && tone.wash_preference !== "none") {
    return { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.50, color: "#000000" };
  }

  // 4. Luxury / editorial + fundo ok → vignette discreta ou nada
  if (tone.name === "minimal_luxury" || tone.name === "editorial_clean") {
    if (bg.entropy_level < 0.5) return { type: "none" };
    return { type: "vignette", intensity: "soft" };
  }

  // 5. Bold / aggressive → faixa sólida da cor primária da marca
  if (tone.name === "bold_aggressive" || tone.name === "vibrant_pop") {
    return { type: "solid_band", position: "bottom", height_percent: 35, color: brandColor, opacity: 0.92 };
  }

  // 6. Warm organic → gradiente suave
  return { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.42, color: "#000000" };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — TEXT ZONE (derivado de safe_areas + subject_position)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Define a zona de texto com base em onde o sujeito NÃO está.
 * Garante que o headline nunca sobreponha o ponto focal da imagem.
 */
export function defineTextZone(bg: BackgroundAnalysis, tone: ToneProfile): TextZone {
  const { subject_position, safe_areas } = bg;
  const isMinimal = tone.composition.density === "minimal";
  const h = isMinimal ? 25 : 33;

  // Sujeito à direita → texto à esquerda
  if (subject_position === "right" && safe_areas.includes("bottom-left")) {
    return { anchor: "bottom-left",  width_percent: 55, height_percent: h, padding: 24, safe_margin: true };
  }
  // Sujeito à esquerda → texto à direita
  if (subject_position === "left"  && safe_areas.includes("bottom-right")) {
    return { anchor: "bottom-right", width_percent: 55, height_percent: h, padding: 24, safe_margin: true };
  }
  // Sujeito central ou preenchendo o frame → faixa inferior full-width
  if (subject_position === "center" || subject_position === "full") {
    return { anchor: "bottom-full", width_percent: 100, height_percent: h, padding: 24, safe_margin: true };
  }
  // Sujeito no topo → texto embaixo full-width
  if (subject_position === "top") {
    return { anchor: "bottom-full", width_percent: 100, height_percent: h + 5, padding: 24, safe_margin: true };
  }
  // Sujeito embaixo → texto no topo
  if (subject_position === "bottom" && safe_areas.includes("top-full")) {
    return { anchor: "top-full",    width_percent: 100, height_percent: 28, padding: 24, safe_margin: true };
  }

  // Fallback: bottom-left
  return { anchor: "bottom-left", width_percent: 60, height_percent: 32, padding: 24, safe_margin: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — HEADLINE PARAMS (motor tipográfico)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve parâmetros tipográficos com base na percepção do fundo e no tom.
 *
 * Regras aplicadas:
 *   - Fundo com muita informação → headline mais curta (menos chars/linha)
 *   - Wash ativo ou fundo escuro → texto branco; caso contrário → texto escuro
 *   - Luxury → light weight + sentence case
 *   - Aggressive → black weight + uppercase
 *   - Cor de destaque só para tons vibrantes
 */
export function resolveHeadlineParams(
  bg:             BackgroundAnalysis,
  tone:           ToneProfile,
  wash:           WashDecision,
  primaryColor:   string,
  secondaryColor: string,
): HeadlineParams {
  // Cor base: wash ativo ou fundo escuro → branco; fundo claro sem wash → escuro
  const hasEffectiveWash = wash.type !== "none" && wash.type !== "vignette";
  const bottomIsDark     = bg.brightness_zones.bottom === "dark";
  const useLight         = hasEffectiveWash || bottomIsDark;
  const baseColor        = useLight ? "#FFFFFF" : "#111111";

  const weightMap: Record<string, HeadlineParams["font_weight"]> = {
    light: "400", regular: "700", bold: "800", black: "900",
  };
  const fontWeight = weightMap[tone.typography.weight] ?? "800";

  // Menos caracteres por linha quando o fundo é poluído
  const maxChars = bg.entropy_level > 0.65 ? 16 : bg.entropy_level > 0.4 ? 20 : 26;

  const estimatedLines: 1 | 2 | 3 = tone.composition.density === "minimal" ? 1 : 2;

  return {
    font_weight:        fontWeight,
    color:              baseColor,
    case_style:         tone.typography.case_style,
    max_chars_per_line: maxChars,
    estimated_lines:    estimatedLines,
    contrast_ratio:     "AA",
    accent_color:       tone.color_behavior.saturation === "vibrant" ? primaryColor : secondaryColor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5 — BRAND ELEMENTS (logo na área de menor atenção)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Posiciona logo e rodapé na área de menor atenção visual —
 * longe do sujeito principal e da zona de texto.
 */
export function placeBrandElements(
  bg:         BackgroundAnalysis,
  tone:       ToneProfile,
  textZone:   TextZone,
  brandColor: string,
): BrandElementsPlacement {
  const { subject_position, brightness_zones } = bg;

  // Logo vai para o canto oposto ao sujeito
  let logoPos: LogoPlacement = "top-left";
  if      (subject_position === "left")   logoPos = "top-right";
  else if (subject_position === "right")  logoPos = "top-left";
  else if (subject_position === "top")    logoPos = "bottom-right";
  else if (subject_position === "center") logoPos = "top-left";

  // Se a zona de texto está no topo, logo vai para o rodapé oposto
  if (textZone.anchor.includes("top")) {
    logoPos = subject_position === "right" ? "bottom-left" : "bottom-right";
  }

  const logoSize: BrandElementsPlacement["logo_size"] =
    tone.name === "minimal_luxury"  ? "small"  :
    tone.name === "bold_aggressive" ? "medium" : "small";

  // Footer bar — minimal_luxury não usa barra sólida
  const footerEnabled = tone.name !== "minimal_luxury";
  const footerColor   =
    tone.name === "editorial_clean" ? "#111111"     :
    tone.name === "minimal_luxury"  ? "transparent" :
    brandColor;

  // Boost de contraste se a zona do logo é clara (para o logo não se perder)
  const logoZone      = logoPos.includes("top") ? brightness_zones.top : brightness_zones.bottom;
  const contrastBoost = logoZone !== "dark";

  return {
    logo_position:       logoPos,
    logo_size:           logoSize,
    logo_contrast_boost: contrastBoost,
    footer_bar: {
      enabled:   footerEnabled,
      style:     footerColor === "transparent" ? "transparent" : "solid",
      color:     footerColor,
      height_px: 56,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDADOR — verifica coerência da pilha e retorna scores + warnings
// ─────────────────────────────────────────────────────────────────────────────

export function validateLayerStack(
  stack: Omit<LayerStack, "validation">,
): ArtDirectionValidation {
  const warnings: string[] = [];
  let readability = 1.0;
  let overlap     = 1.0;
  let brand       = 1.0;
  let balance     = 1.0;

  const { background_analysis: bg, wash, text_zone, headline, brand_elements } = stack;

  // Texto branco sobre fundo claro sem wash → contraste insuficiente
  if (wash.type === "none" && bg.brightness_zones.bottom === "light" && headline.color === "#FFFFFF") {
    readability -= 0.45;
    warnings.push("Texto branco sobre fundo claro sem wash — risco de contraste insuficiente");
  }

  // Fundo poluído sem wash → texto vai se perder
  if (bg.entropy_level > 0.7 && wash.type === "none") {
    readability -= 0.35;
    warnings.push("Fundo com alta entropia sem wash — legibilidade comprometida");
  }

  // Zona de texto sobre o sujeito centralizado → sobreposição
  if (text_zone.anchor.includes("center") && bg.subject_position === "center") {
    overlap -= 0.35;
    warnings.push("Zona de texto coincide com sujeito central — risco de sobreposição");
  }

  // Logo e texto no mesmo lado → desequilíbrio visual
  const logoLeft = brand_elements.logo_position.includes("left");
  const textLeft = text_zone.anchor.includes("left");
  if (logoLeft && textLeft && bg.subject_position !== "right") {
    balance -= 0.2;
    warnings.push("Logo e texto ambos à esquerda — considere logo no canto oposto");
  }

  // Tom vibrant sem accent_color
  if (stack.tone_profile.color_behavior.saturation === "vibrant" && !headline.accent_color) {
    brand -= 0.15;
    warnings.push("Tom vibrant sem cor de destaque definida no headline");
  }

  const passes = readability >= 0.6 && overlap >= 0.6;

  return {
    readability_score: Math.max(0, readability),
    overlap_score:     Math.max(0, overlap),
    brand_consistency: Math.max(0, brand),
    visual_balance:    Math.max(0, balance),
    passes,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-FIX — corrige falhas de validação automaticamente
// ─────────────────────────────────────────────────────────────────────────────

function autoFix(
  stack:      Omit<LayerStack, "validation">,
  validation: ArtDirectionValidation,
): Omit<LayerStack, "validation"> {
  let fixed = { ...stack };

  // Fix 1: Legibilidade baixa + sem wash → gradiente suave
  if (validation.readability_score < 0.6 && fixed.wash.type === "none") {
    fixed = {
      ...fixed,
      wash:     { type: "gradient", direction: "bottom-up", from_opacity: 0, to_opacity: 0.50, color: "#000000" },
      headline: { ...fixed.headline, color: "#FFFFFF" },
    };
  }

  // Fix 2: Sobreposição → mover zona de texto para faixa inferior full-width
  if (validation.overlap_score < 0.6 && !fixed.text_zone.anchor.includes("full")) {
    fixed = {
      ...fixed,
      text_zone: { ...fixed.text_zone, anchor: "bottom-full", width_percent: 100 },
    };
  }

  return fixed;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: composeLayerStack — orquestra todas as camadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motor principal. Recebe percepção (bg) + direção criativa (tone) + marca e
 * devolve uma LayerStack completa, validada e auto-corrigida se necessário.
 */
export function composeLayerStack(
  bg:    BackgroundAnalysis,
  tone:  ToneProfile,
  brand: Pick<BrandProfile, "primary_color" | "secondary_color">,
): LayerStack {
  const wash           = decideWash(bg, tone, brand.primary_color);
  const text_zone      = defineTextZone(bg, tone);
  const headline       = resolveHeadlineParams(bg, tone, wash, brand.primary_color, brand.secondary_color);
  const brand_elements = placeBrandElements(bg, tone, text_zone, brand.primary_color);

  let stack: Omit<LayerStack, "validation"> = {
    background_analysis: bg,
    tone_profile:        tone,
    wash,
    text_zone,
    headline,
    brand_elements,
  };

  const validation = validateLayerStack(stack);

  if (!validation.passes) {
    stack = autoFix(stack, validation);
    const revalidation = validateLayerStack(stack);
    return { ...stack, validation: revalidation };
  }

  return { ...stack, validation };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZER — LayerStack → layout_prompt string (para img2img)
// ─────────────────────────────────────────────────────────────────────────────

function washToString(wash: WashDecision): string {
  switch (wash.type) {
    case "none":
      return "none";
    case "gradient":
      return `gradient ${wash.direction ?? "bottom-up"} from transparent to ${wash.color ?? "#000"} at ${Math.round((wash.to_opacity ?? 0.5) * 100)}% opacity`;
    case "solid_band":
      return `solid ${wash.color ?? "#000"} band at ${wash.position ?? "bottom"} covering ${wash.height_percent ?? 30}% of frame, ${Math.round((wash.opacity ?? 0.9) * 100)}% opacity`;
    case "vignette":
      return `${wash.intensity ?? "soft"} vignette on edges only, no center overlay`;
    case "frosted_panel":
      return `frosted glass panel on ${wash.side ?? "left"} side, ${wash.width_percent ?? 50}% width, ${wash.blur ?? 12}px blur`;
    default:
      return "none";
  }
}

/**
 * Converte LayerStack em string de layout_prompt para img2img.
 * Usa o formato de camadas numeradas para máxima clareza ao modelo gerador.
 */
export function layerStackToLayoutPrompt(stack: LayerStack): string {
  const { background_analysis: bg, tone_profile: tone, wash, text_zone, headline, brand_elements } = stack;

  const bgDesc    = `${bg.subject_position} subject, ${bg.depth_of_field} depth of field, ${bg.color_temperature} color temperature`;
  const washDesc  = washToString(wash);
  const zoneDesc  = `${text_zone.anchor}, ${text_zone.height_percent}% height × ${text_zone.width_percent}% width, ${text_zone.padding}px padding`;
  const headDesc  = `weight ${headline.font_weight}, ${headline.color} text, ${headline.case_style}, max ${headline.max_chars_per_line} chars/line, ${headline.estimated_lines} line(s)`;
  const brandDesc = `logo ${brand_elements.logo_position} ${brand_elements.logo_size}${brand_elements.logo_contrast_boost ? " with contrast badge" : ""}, footer ${brand_elements.footer_bar.enabled ? `${brand_elements.footer_bar.style} ${brand_elements.footer_bar.color} ${brand_elements.footer_bar.height_px}px` : "none"}`;

  return [
    `LAYER 1 — BACKGROUND: ${bgDesc}.`,
    `LAYER 2 — WASH: ${washDesc}.`,
    `LAYER 3 — TEXT ZONE: ${zoneDesc}.`,
    `LAYER 4 — HEADLINE: ${headDesc}.`,
    `LAYER 5 — BRAND ELEMENTS: ${brandDesc}.`,
    `TONE: ${tone.name.replace(/_/g, " ")}.`,
    `All text overlays are in Brazilian Portuguese (pt-BR).`,
  ].join(" ");
}
