/**
 * lib/composer.tsx
 *
 * Post Compositor — transforma a imagem AI gerada em um post completo e
 * profissional para Instagram, com:
 *   • Foto AI como background (full-bleed, redimensionada pelo sharp)
 *   • Gradiente com cor primária da marca na metade inferior
 *   • Headline em Montserrat Black 900 (branca na linha 1, cor secundária na linha 2)
 *   • Faixa inferior com nome do cliente + @instagram
 *   • Logo do cliente no canto superior esquerdo (quando disponível)
 *
 * Stack:
 *   satori     → renderiza JSX → SVG (texto convertido em paths, sem dependência de fonte no SVG)
 *   @resvg/resvg-js → SVG → PNG buffer transparente
 *   sharp      → redimensiona bgImage + composite overlay + logo → JPEG final
 *   R2         → armazena o resultado
 */

import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { uploadToR2 } from "./r2";
import {
  resolveTypography,
  splitHeadlineForStyle,
  type TypographyStyle,
} from "./composer/typography";
import {
  resolveLogoPlacement,
  computeLogoCoords,
  computeBadgeStyle,
  type LogoPlacement,
} from "./composer/logo-placement";
import {
  resolveGradientColor,
  isDarkMood,
} from "./composer/color-mood";
import type { LayerStack, WashDecision, TextZone, HeadlineParams } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComposeOptions {
  imageUrl?:            string;           // URL da imagem gerada pela IA (preferido)
  imageBuffer?:         Buffer;           // Alternativa: buffer já em memória (preview/placeholder)
  /** Quando true, salva como `posts/{id}/preview.jpg` (não sobrescreve composed.jpg) */
  preview?:             boolean;
  logoUrl?:             string | null;    // URL do logo do cliente (Firebase Storage)
  visualHeadline:       string;           // Máx 6 palavras — headline em cima da foto
  instagramHandle?:     string | null;    // @handle do cliente
  clientName:           string;           // Nome do cliente (bottom strip)
  primaryColor:         string;           // Hex da cor primária da marca
  secondaryColor:       string;           // Hex da cor secundária
  format:               "feed" | "stories" | "reels_cover" | "linkedin_post" | "linkedin_article" | "linkedin_carousel";
  postId:               string;
  // Opcionais — derivados do ReferenceDNA / BrandDNA quando presentes
  compositionZone?:     "left" | "right" | "bottom" | "top" | "center";
  backgroundTreatment?: string;           // texto livre do reference_dna.background_treatment
  /** reference_dna.visual_headline_style — descrição do estilo do headline na referência */
  headlineStyle?:       string;
  /** brand_dna.typography_pattern — padrão tipográfico sintetizado da marca */
  typographyPattern?:   string;
  /** Placement explícito do logo (art_direction/ref_dna/brand_dna) */
  logoPlacement?:       LogoPlacement;
  /** Descrição do mood de cores (reference_dna.color_mood / brand_dna.color_treatment) */
  colorMood?:           string;
  /** LayerStack gerado pelo Art Direction Engine — quando presente, controla o output visual */
  layer_stack?:         LayerStack;
}

// ── Font cache (persiste entre invocações warm no Lambda) ────────────────────

interface FontCache {
  montserrat900:    ArrayBuffer;
  inter700:         ArrayBuffer;
  inter500:         ArrayBuffer | null;
  playfair700:      ArrayBuffer | null;
  playfair700Italic: ArrayBuffer | null;
  dancing700:       ArrayBuffer | null;
}

let _fontCache: FontCache | null = null;

async function fetchSafe(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return r.ok ? r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function ensureFonts(): Promise<FontCache> {
  if (_fontCache) return _fontCache;

  // satori aceita apenas TTF ou WOFF — NÃO suporta WOFF2
  // Fonte: repositório Google Fonts no GitHub via jsDelivr CDN (TTF estático)
  const [m900, i700, i500, pf700, pf700i, ds700] = await Promise.all([
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/static/Montserrat-Black.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Medium.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playfairdisplay/static/PlayfairDisplay-Bold.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/playfairdisplay/static/PlayfairDisplay-BoldItalic.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/dancingscript/static/DancingScript-Bold.ttf"),
  ]);

  // Fallback fontsource WOFF apenas para fontes essenciais (Montserrat + Inter)
  const [m900Fallback, i700Fallback] = await Promise.all([
    m900 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/montserrat@4/files/montserrat-latin-900-normal.woff"),
    i700 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/inter@4/files/inter-latin-700-normal.woff"),
  ]);

  const montserrat = m900 ?? m900Fallback;
  const inter      = i700 ?? i700Fallback;

  if (!montserrat) throw new Error("[composer] Falha ao carregar fonte Montserrat 900");
  if (!inter)      throw new Error("[composer] Falha ao carregar fonte Inter 700");

  _fontCache = {
    montserrat900:     montserrat,
    inter700:          inter,
    inter500:          i500,
    playfair700:       pf700,
    playfair700Italic: pf700i,
    dancing700:        ds700,
  };
  return _fontCache;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureHex(color: string): string {
  if (!color) return "#6d28d9";
  return color.startsWith("#") ? color : `#${color}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = ensureHex(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Renderiza um span do headline aplicando a TypographyStyle resolvida.
 * Falls back graciosamente quando uma fonte opcional não foi carregada.
 */
function headlineSpan(
  text: string,
  color: string,
  fontSize: number,
  style: TypographyStyle,
): React.ReactElement {
  return (
    <span
      style={{
        fontSize,
        fontWeight:    style.weight,
        fontFamily:    style.satoriName,
        fontStyle:     style.italic ? "italic" : "normal",
        color,
        lineHeight:    style.lineHeight,
        letterSpacing: style.letterSpacing,
      }}
    >
      {text}
    </span>
  );
}

function sanitizeHandle(handle: string): string {
  return handle.replace(/^@/, "").trim();
}

// ── Template JSX (renderizado pelo satori) ───────────────────────────────────

/**
 * Detecta se o tratamento de fundo da referência indica ausência de overlay.
 * Quando true → modo "clean": sem gradiente colorido, sem faixa sólida.
 */
function isNoOverlayStyle(backgroundTreatment?: string): boolean {
  if (!backgroundTreatment) return false;
  const t = backgroundTreatment.toLowerCase();

  // Palavras que indicam ausência de overlay artificial
  const noOverlayKeywords = [
    "none", "no overlay", "no gradient", "no added", "no artificial",
    "direct", "directly on", "natural", "natural dark", "natural background",
    "transparent", "without overlay", "without gradient", "without any",
    "text on image", "text directly", "on the surface", "on the background",
    "drop shadow only", "shadow only", "raw image", "just image",
    "no treatment", "untreated", "clean background", "image itself",
    "organic", "surface provides", "background provides", "contrast from",
  ];

  return noOverlayKeywords.some(kw => t.includes(kw));
}

/**
 * Opacidade do gradiente de marca para os modos COM overlay.
 * "heavy/solid/dense" → 0.93  |  default → 0.82
 */
function resolveGradientOpacity(backgroundTreatment?: string): number {
  const t = (backgroundTreatment ?? "").toLowerCase();
  return /heavy|solid|dense|strong/.test(t) ? 0.93 : 0.82;
}

// ── LayerStack helpers ───────────────────────────────────────────────────────

function applyCase(text: string, style: HeadlineParams["case_style"]): string {
  if (style === "uppercase") return text.toUpperCase();
  if (style === "titlecase") return text.replace(/\b\w/g, c => c.toUpperCase());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wrapText(text: string, maxChars: number): [string, string | null] {
  if (text.length <= maxChars) return [text, null];
  const words = text.split(" ");
  let line1 = "";
  for (let i = 0; i < words.length; i++) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (candidate.length > maxChars && line1) return [line1, words.slice(i).join(" ")];
    line1 = candidate;
  }
  return [text, null];
}

function buildWashDiv(
  wash:       WashDecision,
  brandColor: string,
  W:          number,
  H:          number,
  footerH:    number,
): React.ReactElement | null {
  if (wash.type === "none") return null;

  if (wash.type === "gradient") {
    const color  = wash.color ?? "#000000";
    const from   = wash.from_opacity ?? 0;
    const to     = wash.to_opacity   ?? 0.5;
    const dir    = wash.direction    ?? "bottom-up";
    const cssDir = dir === "bottom-up" ? "to top" : dir === "top-down" ? "to bottom" : "to right";
    // bottom-up: opaque at the bottom, transparent at top of the div
    const [c0, c1] = dir === "bottom-up"
      ? [hexToRgba(color, to), hexToRgba(color, from)]
      : [hexToRgba(color, from), hexToRgba(color, to)];
    return (
      <div
        style={{
          position:   "absolute",
          bottom:     footerH,
          left:       0,
          right:      0,
          height:     Math.round(H * 0.60),
          background: `linear-gradient(${cssDir}, ${c0} 0%, ${c1} 100%)`,
          display:    "flex",
        }}
      />
    );
  }

  if (wash.type === "solid_band") {
    const bh    = Math.round(H * (wash.height_percent ?? 35) / 100);
    const color = hexToRgba(wash.color ?? brandColor, wash.opacity ?? 0.9);
    const pos   = wash.position ?? "bottom";
    return (
      <div
        style={{
          position:        "absolute",
          [pos]:           footerH,
          left:            0,
          right:           0,
          height:          bh,
          backgroundColor: color,
          display:         "flex",
        }}
      />
    );
  }

  if (wash.type === "vignette") {
    const op = wash.intensity === "strong" ? 0.55 : 0.28;
    return (
      <div
        style={{
          position:        "absolute",
          top:             0,
          bottom:          0,
          left:            0,
          right:           0,
          backgroundColor: hexToRgba("#000000", op * 0.35),
          display:         "flex",
        }}
      />
    );
  }

  if (wash.type === "frosted_panel") {
    const pw   = Math.round(W * (wash.width_percent ?? 50) / 100);
    const side = wash.side ?? "left";
    return (
      <div
        style={{
          position:        "absolute",
          top:             0,
          bottom:          footerH,
          [side]:          0,
          width:           pw,
          backgroundColor: hexToRgba("#000000", 0.42),
          display:         "flex",
        }}
      />
    );
  }

  return null;
}

function textZoneStyle(
  zone:    TextZone,
  W:       number,
  H:       number,
  footerH: number,
): React.CSSProperties {
  const pad   = zone.padding;
  const zoneW = Math.round(W * zone.width_percent / 100);
  const base: React.CSSProperties = {
    position:      "absolute",
    display:       "flex",
    flexDirection: "column",
  };
  switch (zone.anchor) {
    case "bottom-full":   return { ...base, bottom: footerH + pad, left: pad, right: pad };
    case "bottom-left":   return { ...base, bottom: footerH + pad, left: pad, width: zoneW };
    case "bottom-right":  return { ...base, bottom: footerH + pad, right: pad, width: zoneW };
    case "top-full":      return { ...base, top: pad, left: pad, right: pad };
    case "top-left":      return { ...base, top: pad, left: pad, width: zoneW };
    case "top-right":     return { ...base, top: pad, right: pad, width: zoneW };
    case "center":        return { ...base, top: Math.round(H * 0.38), left: pad, right: pad };
    default:              return { ...base, bottom: footerH + pad, left: pad, right: pad };
  }
}

/**
 * Overlay builder driven entirely by LayerStack — sem strings livres da IA.
 * Substitui buildOverlayElement() quando opts.layer_stack está presente.
 */
function buildOverlayFromLayerStack(
  opts:  ComposeOptions,
  stack: LayerStack,
  W:     number,
  H:     number,
): React.ReactElement {
  const { wash, text_zone, headline, brand_elements } = stack;
  const primary   = ensureHex(opts.primaryColor);
  const secondary = ensureHex(opts.secondaryColor);
  const handle    = opts.instagramHandle ? sanitizeHandle(opts.instagramHandle) : "";

  // Footer bar
  const footerEnabled = brand_elements.footer_bar.enabled;
  const footerH       = footerEnabled ? brand_elements.footer_bar.height_px : 0;
  const footerBg      = brand_elements.footer_bar.color === "transparent"
    ? "rgba(0,0,0,0)" : ensureHex(brand_elements.footer_bar.color);

  // Text
  const displayText        = applyCase(opts.visualHeadline, headline.case_style);
  const [line1, line2]     = wrapText(displayText, headline.max_chars_per_line);
  const hasTwoLines        = !!line2;
  const fontFamily         = headline.font_weight === "900" ? "Montserrat" : "Inter";
  const fontWeightNum      = parseInt(headline.font_weight, 10);
  const baseSize           = hasTwoLines ? 86 : 108;
  const accentColor        = headline.accent_color ?? secondary;

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden" }}>

      {/* ── LAYER 2: WASH ────────────────────────────────────────────────── */}
      {buildWashDiv(wash, primary, W, H, footerH)}

      {/* ── LAYER 3+4: TEXT ZONE + HEADLINE ──────────────────────────────── */}
      <div style={textZoneStyle(text_zone, W, H, footerH)}>
        <span style={{ fontSize: baseSize, fontWeight: fontWeightNum, fontFamily, color: headline.color, lineHeight: 1.1, letterSpacing: -0.5 }}>
          {line1}
        </span>
        {hasTwoLines && (
          <span style={{ fontSize: baseSize, fontWeight: fontWeightNum, fontFamily, color: accentColor, lineHeight: 1.1, letterSpacing: -0.5 }}>
            {line2}
          </span>
        )}
      </div>

      {/* ── LAYER 5: FOOTER BAR ──────────────────────────────────────────── */}
      {footerEnabled && (
        <div
          style={{
            position:        "absolute",
            bottom:          0,
            left:            0,
            right:           0,
            height:          footerH,
            backgroundColor: footerBg,
            display:         "flex",
            alignItems:      "center",
            justifyContent:  "space-between",
            padding:         "0 48px",
          }}
        >
          <span style={{ color: "white", fontSize: 26, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
            {opts.clientName.toUpperCase()}
          </span>
          {handle && (
            <span style={{ color: accentColor, fontSize: 26, fontFamily: "Inter", fontWeight: 700, letterSpacing: 0.5 }}>
              @{handle}
            </span>
          )}
        </div>
      )}

      {/* ── LAYER 5: LOGO BADGE (contrast boost) ──────────────────────────── */}
      {brand_elements.logo_contrast_boost && (() => {
        const lp = brand_elements.logo_position;
        if (lp === "none") return null;
        const badgeSize = brand_elements.logo_size === "large" ? 96 : brand_elements.logo_size === "medium" ? 80 : 64;
        const margin    = 32;
        const posStyle: React.CSSProperties = lp === "top-left"
          ? { top: margin, left: margin }
          : lp === "top-right"
          ? { top: margin, right: margin }
          : lp === "bottom-left"
          ? { bottom: footerH + margin, left: margin }
          : lp === "bottom-right"
          ? { bottom: footerH + margin, right: margin }
          : { bottom: footerH + margin, left: "50%", marginLeft: -(badgeSize / 2) };
        return (
          <div
            style={{
              position:        "absolute",
              width:           badgeSize + 16,
              height:          badgeSize + 16,
              borderRadius:    12,
              backgroundColor: hexToRgba(primary, 0.55),
              display:         "flex",
              ...posStyle,
            }}
          />
        );
      })()}
    </div>
  );
}

function buildOverlayElement(
  opts: ComposeOptions,
  W: number,
  H: number
): React.ReactElement {
  // ── LayerStack path: motor determinístico sobrepõe sistema string-based ───
  if (opts.layer_stack) {
    return buildOverlayFromLayerStack(opts, opts.layer_stack, W, H);
  }

  const primary   = ensureHex(opts.primaryColor);
  const secondary = ensureHex(opts.secondaryColor);
  const zone      = opts.compositionZone ?? "bottom";
  const handle    = opts.instagramHandle ? sanitizeHandle(opts.instagramHandle) : "";

  // ── Resolve placement do logo (fallback: detecta via signals do DNA) ──────
  const placement = opts.logoPlacement
    ?? resolveLogoPlacement(opts.headlineStyle, opts.backgroundTreatment, opts.typographyPattern);

  // ── Resolve estilo tipográfico baseado em DNA da referência/marca ─────────
  const typo           = resolveTypography(opts.headlineStyle, opts.typographyPattern);
  const [line1, line2] = splitHeadlineForStyle(opts.visualHeadline, typo);
  const hasTwoLines    = !!line2;
  const baseSize       = hasTwoLines ? 86 : 108;
  const fontSize       = Math.round(baseSize * typo.sizeFactor);
  const lineH          = fontSize * typo.lineHeight;
  const textH          = lineH * (hasTwoLines ? 2.1 : 1.1);

  // ── MODO CLEAN: referência sem overlay ────────────────────────────────────
  // Quando o DNA da referência indica que não há gradiente ou overlay colorido
  // (ex: "none — text directly on image", "natural dark background", etc.),
  // o compositor protótipa o estilo original:
  //   • scrim escuro mínimo (20-25%) apenas para garantir leiturabilidade
  //   • zero faixa sólida de cor primária
  //   • nome do cliente e @handle flutuam no rodapé como texto simples
  //   • logo com badge transparente sutil
  if (isNoOverlayStyle(opts.backgroundTreatment)) {
    // Posição do bloco de texto baseada na zona (sem offset de strip)
    type CSSp = React.CSSProperties;
    const textStyle: CSSp = (() => {
      switch (zone) {
        case "top":
          return { position: "absolute", top: 80, left: 56, right: 56, display: "flex", flexDirection: "column" };
        case "center":
          return { position: "absolute", top: Math.round(H / 2 - textH / 2), left: 56, right: 56, display: "flex", flexDirection: "column" };
        case "left":
          return { position: "absolute", top: Math.round(H * 0.32), left: 56, right: Math.round(W * 0.38), display: "flex", flexDirection: "column" };
        case "right":
          return { position: "absolute", top: Math.round(H * 0.32), right: 56, left: Math.round(W * 0.38), display: "flex", flexDirection: "column" };
        default: // bottom — posição baixa sem reservar espaço para strip
          return { position: "absolute", bottom: 110, left: 56, right: 56, display: "flex", flexDirection: "column" };
      }
    })();

    return (
      <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden" }}>

        {/* ── Scrim escuro mínimo — só para garantir contraste do texto ── */}
        {/* NÃO usa cor de marca. Imita o escurecimento natural da referência */}
        <div
          style={{
            position:   "absolute",
            bottom:     0,
            left:       0,
            right:      0,
            height:     Math.round(H * 0.42),
            background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.28) 100%)",
            display:    "flex",
          }}
        />

        {/* ── Headline (tipografia resolvida via DNA) ───────────────────── */}
        <div style={textStyle}>
          {headlineSpan(line1, "white", fontSize, typo)}
          {hasTwoLines && headlineSpan(line2, secondary, fontSize, typo)}
        </div>

        {/* ── Etiquetas de marca flutuantes (sem barra sólida) ──────────── */}
        <div
          style={{
            position:       "absolute",
            bottom:         32,
            left:           56,
            right:          56,
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
          }}
        >
          <span style={{ color: "white", fontSize: 24, fontFamily: "Inter", fontWeight: 700, letterSpacing: 0.5, opacity: 0.90 }}>
            {opts.clientName.toUpperCase()}
          </span>
          {handle && (
            <span style={{ color: secondary, fontSize: 24, fontFamily: "Inter", fontWeight: 700, letterSpacing: 0.5, opacity: 0.90 }}>
              @{handle}
            </span>
          )}
        </div>

        {/* ── Badge sutil para o logo (posição driven por DNA) ──────────── */}
        {(() => {
          const badgeStyle = computeBadgeStyle({
            placement, canvasW: W, canvasH: H,
            stripH: 0, // clean mode não tem strip
            backgroundColor: hexToRgba(primary, 0.50),
          });
          return badgeStyle ? <div style={badgeStyle} /> : null;
        })()}
      </div>
    );
  }

  // ── MODO PADRÃO: gradiente de marca + faixa inferior ─────────────────────
  // Usado quando a referência tem overlay colorido, OU quando não há referência.
  //
  // Gradient: tint vem do colorMood do DNA (ex: "dark moody warm amber" → amber),
  // fallback é a primaryColor da marca. Assim uma referência com mood distinto
  // não é "lavada" pelo violeta da marca.
  //
  // Strip inferior (faixa sólida): SEMPRE usa primaryColor. Ela é a âncora de
  // brand no post, não deve sofrer drift do DNA da referência.
  const STRIP_H    = 110;
  const maxOp      = resolveGradientOpacity(opts.backgroundTreatment);
  const gradTint   = resolveGradientColor(opts.colorMood, opts.primaryColor);
  // Em mood escuro, pushamos a opacidade máxima para garantir moodiness
  const effMaxOp   = isDarkMood(opts.colorMood) ? Math.max(maxOp, 0.90) : maxOp;
  const c0         = hexToRgba(gradTint, 0);
  const c1         = hexToRgba(gradTint, effMaxOp * 0.67);
  const c2         = hexToRgba(gradTint, effMaxOp);

  type CSSProps = React.CSSProperties;
  let gradientStyle: CSSProps;
  let textContainerStyle: CSSProps;

  if (zone === "top") {
    gradientStyle = {
      position:   "absolute",
      top:        0,
      left:       0,
      right:      0,
      height:     Math.round(H * 0.55),
      background: `linear-gradient(to top, ${c0} 0%, ${c1} 55%, ${c2} 100%)`,
      display:    "flex",
    };
    textContainerStyle = { position: "absolute", top: 80, left: 50, right: 50, display: "flex", flexDirection: "column" };

  } else if (zone === "center") {
    gradientStyle = {
      position:   "absolute",
      top:        Math.round(H * 0.25),
      left:       0,
      right:      0,
      height:     Math.round(H * 0.5),
      background: `linear-gradient(to bottom, ${c0} 0%, ${c2} 50%, ${c0} 100%)`,
      display:    "flex",
    };
    textContainerStyle = { position: "absolute", top: Math.round(H / 2 - textH / 2), left: 50, right: 50, display: "flex", flexDirection: "column" };

  } else if (zone === "left") {
    gradientStyle = {
      position:   "absolute",
      top:        0,
      bottom:     STRIP_H,
      left:       0,
      width:      Math.round(W * 0.68),
      background: `linear-gradient(to right, ${c2} 0%, ${c1} 65%, ${c0} 100%)`,
      display:    "flex",
    };
    textContainerStyle = { position: "absolute", top: Math.round(H * 0.32), left: 50, right: Math.round(W * 0.35), display: "flex", flexDirection: "column" };

  } else if (zone === "right") {
    gradientStyle = {
      position:   "absolute",
      top:        0,
      bottom:     STRIP_H,
      right:      0,
      width:      Math.round(W * 0.68),
      background: `linear-gradient(to left, ${c2} 0%, ${c1} 65%, ${c0} 100%)`,
      display:    "flex",
    };
    textContainerStyle = { position: "absolute", top: Math.round(H * 0.32), right: 50, left: Math.round(W * 0.35), display: "flex", flexDirection: "column" };

  } else {
    // bottom (default)
    gradientStyle = {
      position:   "absolute",
      bottom:     STRIP_H,
      left:       0,
      right:      0,
      height:     Math.round(H * 0.58),
      background: `linear-gradient(to bottom, ${c0} 0%, ${c1} 55%, ${c2} 100%)`,
      display:    "flex",
    };
    textContainerStyle = { position: "absolute", bottom: STRIP_H + 48 + textH, left: 50, right: 50, display: "flex", flexDirection: "column" };
  }

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden" }}>

      {/* ── Gradiente de marca ────────────────────────────────────────── */}
      <div style={gradientStyle} />

      {/* ── Faixa inferior sólida ─────────────────────────────────────── */}
      <div
        style={{
          position:        "absolute",
          bottom:          0,
          left:            0,
          right:           0,
          height:          STRIP_H,
          backgroundColor: primary,
          borderTop:       `3px solid ${secondary}`,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "space-between",
          padding:         "0 50px",
        }}
      >
        <span style={{ color: "white", fontSize: 28, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
          {opts.clientName.toUpperCase()}
        </span>
        {handle && (
          <span style={{ color: secondary, fontSize: 28, fontFamily: "Inter", fontWeight: 700, letterSpacing: 0.5 }}>
            @{handle}
          </span>
        )}
      </div>

      {/* ── Headline (tipografia resolvida via DNA) ───────────────────── */}
      <div style={textContainerStyle}>
        {headlineSpan(line1, "white", fontSize, typo)}
        {hasTwoLines && headlineSpan(line2, secondary, fontSize, typo)}
      </div>

      {/* ── Badge de fundo para o logo (posição driven por DNA) ───────── */}
      {(() => {
        const badgeStyle = computeBadgeStyle({
          placement, canvasW: W, canvasH: H,
          stripH: STRIP_H,
          backgroundColor: hexToRgba(primary, 0.72),
        });
        return badgeStyle ? <div style={badgeStyle} /> : null;
      })()}
    </div>
  );
}

// ── Função principal ─────────────────────────────────────────────────────────

export async function composePost(opts: ComposeOptions): Promise<string> {
  const W = 1080;
  const H = opts.format === "feed" ? 1350 : 1920;

  // ── 1. Carregar fontes ─────────────────────────────────────────────────────
  const fonts = await ensureFonts();

  const satorifonts: Parameters<typeof satori>[1]["fonts"] = [
    { name: "Montserrat", data: fonts.montserrat900, weight: 900, style: "normal" },
    { name: "Inter",      data: fonts.inter700,      weight: 700, style: "normal" },
  ];
  if (fonts.inter500) {
    satorifonts.push({ name: "Inter", data: fonts.inter500, weight: 500, style: "normal" });
  }
  if (fonts.playfair700) {
    satorifonts.push({ name: "PlayfairDisplay", data: fonts.playfair700, weight: 700, style: "normal" });
  }
  if (fonts.playfair700Italic) {
    satorifonts.push({ name: "PlayfairDisplay", data: fonts.playfair700Italic, weight: 700, style: "italic" });
  }
  if (fonts.dancing700) {
    satorifonts.push({ name: "DancingScript", data: fonts.dancing700, weight: 700, style: "normal" });
  }

  // ── 2. Renderizar overlay com satori → SVG → PNG ───────────────────────────
  const element = buildOverlayElement(opts, W, H);

  const svg        = await satori(element, { width: W, height: H, fonts: satorifonts });
  const resvg      = new Resvg(svg, { fitTo: { mode: "width", value: W } });
  const overlayPng = resvg.render().asPng();

  // ── 3. Baixar e redimensionar imagem AI (background) ──────────────────────
  let imgBuffer: Buffer;
  if (opts.imageBuffer) {
    imgBuffer = opts.imageBuffer;
  } else {
    if (!opts.imageUrl) throw new Error("[composer] imageUrl OU imageBuffer é obrigatório");
    const imgResp = await fetch(opts.imageUrl);
    if (!imgResp.ok) throw new Error(`[composer] Falha ao baixar imageUrl: ${imgResp.status}`);
    imgBuffer = Buffer.from(await imgResp.arrayBuffer());
  }

  const bgBuffer = await sharp(imgBuffer)
    .resize(W, H, { fit: "cover", position: "attention" }) // attention = foca no sujeito principal
    .toBuffer();

  // ── 4. Montar camadas para composite ──────────────────────────────────────
  const layers: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlayPng), top: 0, left: 0 },
  ];

  // ── 5. Logo (composite via sharp — posição driven pelo DNA) ────────────────
  // Prioridade: opts.logoPlacement (DNA explícito) > layer_stack (engine) > heurística
  // opts.logoPlacement vem da cascade Reference DNA → Brand DNA → heurística de texto.
  // Quando o Reference DNA define logo_placement, ele DEVE vencer sobre o engine.
  const resolvedPlacement: LogoPlacement =
    opts.logoPlacement
    ?? (opts.layer_stack?.brand_elements.logo_position as LogoPlacement | undefined)
    ?? resolveLogoPlacement(opts.headlineStyle, opts.backgroundTreatment, opts.typographyPattern);

  if (opts.logoUrl && resolvedPlacement !== "none") {
    try {
      const logoResp = await fetch(opts.logoUrl, { signal: AbortSignal.timeout(8_000) });
      if (logoResp.ok) {
        const logoBuffer = Buffer.from(await logoResp.arrayBuffer());
        // Logo size driven by layer_stack when available
        const logoMaxW = opts.layer_stack?.brand_elements.logo_size === "large"  ? 280
                       : opts.layer_stack?.brand_elements.logo_size === "medium" ? 240
                       : 200;
        const logoMaxH = opts.layer_stack?.brand_elements.logo_size === "large"  ? 100
                       : opts.layer_stack?.brand_elements.logo_size === "medium" ? 80
                       : 60;
        const { data: logoResized, info: logoInfo } = await sharp(logoBuffer)
          .resize(logoMaxW, logoMaxH, { fit: "inside" })
          .toBuffer({ resolveWithObject: true });

        // stripH é 0 em modo clean (sem faixa inferior)
        const cleanMode = opts.layer_stack
          ? opts.layer_stack.wash.type === "none" || opts.layer_stack.wash.type === "vignette"
          : isNoOverlayStyle(opts.backgroundTreatment);
        const stripH    = (opts.layer_stack?.brand_elements.footer_bar.enabled ?? !cleanMode)
          ? (opts.layer_stack?.brand_elements.footer_bar.height_px ?? 110)
          : 0;

        const coords = computeLogoCoords({
          placement: resolvedPlacement,
          canvasW:   W,
          canvasH:   H,
          logoW:     logoInfo.width,
          logoH:     logoInfo.height,
          stripH,
        });

        if (coords) {
          layers.push({ input: logoResized, top: coords.top, left: coords.left });
        }
      }
    } catch (logoErr) {
      console.warn("[composer] Logo não carregou (non-fatal):", logoErr);
    }
  }

  // ── 6. Gerar imagem final ─────────────────────────────────────────────────
  const finalBuffer = await sharp(bgBuffer)
    .composite(layers)
    .jpeg({ quality: 95 })
    .toBuffer();

  // ── 7. Upload para R2 ─────────────────────────────────────────────────────
  const fileName = opts.preview ? "preview.jpg" : "composed.jpg";
  const key      = `posts/${opts.postId}/${fileName}`;
  return uploadToR2(key, finalBuffer, "image/jpeg");
}
