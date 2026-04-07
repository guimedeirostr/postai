/**
 * lib/composer/logo-placement.ts
 *
 * Resolve onde o logo da marca deve ficar no post final, a partir dos sinais
 * de DNA (reference_dna, brand_dna, art_direction).
 *
 * Entrega:
 *   • `resolveLogoPlacement` — detecta via regex nos signals do DNA
 *   • `computeLogoCoords`    — calcula {top,left} em px para sharp composite
 *   • `computeBadgeStyle`    — retorna CSSProperties para o badge no satori
 *
 * Posicionamentos suportados:
 *   top-left          — padrão legado (canto superior esquerdo)
 *   top-right         — canto superior direito
 *   bottom-left       — canto inferior esquerdo
 *   bottom-right      — canto inferior direito (estilo Mocellin)
 *   bottom-center     — centralizado inferior (selo de identidade)
 *   none              — sem logo visível (DNA nega logo overlay)
 */

import type React from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type LogoPlacement =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "bottom-center"
  | "none";

export interface LogoCoords {
  top:  number;
  left: number;
}

// ── Detection patterns ───────────────────────────────────────────────────────

const PLACEMENT_PATTERNS: Array<[RegExp, LogoPlacement]> = [
  // "none" tem prioridade — DNA explicitamente nega logo
  [/\b(no\s+logo|without\s+logo|logo[- ]less|sem\s+logo|no\s+brand\s+mark)\b/i, "none"],

  // Posições específicas — ordem importa para bindings compostos
  [/\b(bottom[- ]right|lower[- ]right|canto\s+inferior\s+direito|inferior\s+direito)\b/i, "bottom-right"],
  [/\b(bottom[- ]left|lower[- ]left|canto\s+inferior\s+esquerdo|inferior\s+esquerdo)\b/i, "bottom-left"],
  [/\b(bottom[- ]center|bottom[- ]middle|centered\s+bottom|centralizado\s+inferior|rodap[ée]\s+central)\b/i, "bottom-center"],
  [/\b(top[- ]right|upper[- ]right|canto\s+superior\s+direito|superior\s+direito)\b/i, "top-right"],
  [/\b(top[- ]left|upper[- ]left|canto\s+superior\s+esquerdo|superior\s+esquerdo)\b/i, "top-left"],
];

/**
 * Resolve placement a partir de sinais concatenados do DNA.
 * Testa em cascade até encontrar a primeira correspondência.
 *
 * Fallback padrão: `"top-left"` (compatível com o comportamento legado).
 */
export function resolveLogoPlacement(
  ...signals: Array<string | null | undefined>
): LogoPlacement {
  const joined = signals.filter(Boolean).join(" ");
  if (!joined.trim()) return "top-left";

  for (const [regex, placement] of PLACEMENT_PATTERNS) {
    if (regex.test(joined)) return placement;
  }
  return "top-left";
}

// ── Coords for sharp composite ───────────────────────────────────────────────

export interface ComputeLogoCoordsParams {
  placement: LogoPlacement;
  canvasW:   number;
  canvasH:   number;
  logoW:     number;
  logoH:     number;
  /** Altura da strip inferior (0 em modo clean). Bottom placements ficam acima da strip. */
  stripH:    number;
  /** Margem padrão das bordas */
  margin?:   number;
}

/**
 * Calcula as coordenadas absolutas (top, left) em px para o sharp composite
 * do logo, respeitando o placement e a altura da strip inferior.
 */
export function computeLogoCoords({
  placement,
  canvasW,
  canvasH,
  logoW,
  logoH,
  stripH,
  margin = 54,
}: ComputeLogoCoordsParams): LogoCoords | null {
  if (placement === "none") return null;

  // Nos cantos superiores, alinhamos com o badge do satori (top=56)
  const topY    = 56;
  // Nos cantos inferiores, subimos acima da strip inferior + margin
  const bottomY = canvasH - stripH - logoH - margin;

  switch (placement) {
    case "top-left":
      return { top: topY, left: margin };
    case "top-right":
      return { top: topY, left: canvasW - logoW - margin };
    case "bottom-left":
      return { top: bottomY, left: margin };
    case "bottom-right":
      return { top: bottomY, left: canvasW - logoW - margin };
    case "bottom-center":
      return { top: bottomY, left: Math.round((canvasW - logoW) / 2) };
    default:
      return { top: topY, left: margin };
  }
}

// ── Badge style for satori overlay ───────────────────────────────────────────

export interface ComputeBadgeStyleParams {
  placement:       LogoPlacement;
  canvasW:         number;
  canvasH:         number;
  stripH:          number;
  backgroundColor: string;
  /** Altura visual do badge (default 100) */
  badgeHeight?:    number;
}

/**
 * Retorna o CSSProperties do badge que fica ATRÁS do logo no satori overlay.
 * Em modo "none", retorna `null` (nenhum badge é renderizado).
 */
export function computeBadgeStyle({
  placement,
  canvasW,
  canvasH,
  stripH,
  backgroundColor,
  badgeHeight = 100,
}: ComputeBadgeStyleParams): React.CSSProperties | null {
  if (placement === "none") return null;

  const base: React.CSSProperties = {
    position:        "absolute",
    height:          badgeHeight,
    minWidth:        48,
    backgroundColor,
    borderRadius:    16,
    display:         "flex",
    alignItems:      "center",
    padding:         "10px 18px",
  };

  const marginEdge = 36;
  const bottomEdge = stripH + 36;

  switch (placement) {
    case "top-left":
      return { ...base, top: marginEdge, left: marginEdge };
    case "top-right":
      return { ...base, top: marginEdge, right: marginEdge };
    case "bottom-left":
      return { ...base, bottom: bottomEdge, left: marginEdge };
    case "bottom-right":
      return { ...base, bottom: bottomEdge, right: marginEdge };
    case "bottom-center":
      // Sem left/right = usa transform via flex no wrapper. Aqui centralizamos
      // pelo horizontal via left:50% + translate, mas satori não suporta transform.
      // Workaround: deixamos left calculado assumindo largura ≈ 240.
      return { ...base, bottom: bottomEdge, left: Math.round((canvasW - 240) / 2) };
    default:
      return { ...base, top: marginEdge, left: marginEdge };
  }
}
