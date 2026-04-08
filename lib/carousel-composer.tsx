/**
 * lib/carousel-composer.tsx
 *
 * Compositor de slides de carrossel para Instagram.
 * Formato: 1080×1350 (4:5) — padrão Instagram feed/carrossel.
 *
 * Recursos:
 *   - Panorâmico: hook + slide 1 compartilham imagem wide (efeito contínuo ao deslizar)
 *   - Fotos da marca: slides de conteúdo podem usar fotos da biblioteca como fundo
 *   - Logo negativa: usa logo_white_url em fundos escuros; fallback: negate() via sharp
 *
 * Stack: satori → SVG → resvg → PNG overlay → sharp composite → JPEG → R2
 */

import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { uploadToR2 } from "./r2";
import type { CarouselSlide, BrandProfile } from "@/types";

// ── Dimensões Instagram 4:5 ───────────────────────────────────────────────────
export const SLIDE_W = 1080;
export const SLIDE_H = 1350;
// Largura da imagem panorâmica (2 slides lado a lado)
export const PANORAMIC_W = SLIDE_W * 2; // 2160

// ── Font cache ────────────────────────────────────────────────────────────────
interface FontCache { montserrat900: ArrayBuffer; inter700: ArrayBuffer; }
let _fontCache: FontCache | null = null;

async function fetchSafe(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return r.ok ? r.arrayBuffer() : null;
  } catch { return null; }
}

async function ensureFonts(): Promise<FontCache> {
  if (_fontCache) return _fontCache;
  const [m900, i700] = await Promise.all([
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/static/Montserrat-Black.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.ttf"),
  ]);
  const [m900fb, i700fb] = await Promise.all([
    m900 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/montserrat@4/files/montserrat-latin-900-normal.woff"),
    i700 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/inter@4/files/inter-latin-700-normal.woff"),
  ]);
  const montserrat = m900 ?? m900fb;
  const inter      = i700 ?? i700fb;
  if (!montserrat) throw new Error("[carousel-composer] Falha ao carregar Montserrat 900");
  if (!inter)      throw new Error("[carousel-composer] Falha ao carregar Inter 700");
  _fontCache = { montserrat900: montserrat, inter700: inter };
  return _fontCache;
}

// ── Color helpers ─────────────────────────────────────────────────────────────
function ensureHex(c: string | null | undefined): string {
  if (!c) return "#6d28d9";
  return c.startsWith("#") ? c : `#${c}`;
}
function hexToRgba(hex: string, a: number): string {
  const h = ensureHex(hex).replace("#","");
  const r = parseInt(h.slice(0,2),16)||0, g=parseInt(h.slice(2,4),16)||0, b=parseInt(h.slice(4,6),16)||0;
  return `rgba(${r},${g},${b},${a})`;
}
function darken(hex: string, pct: number): string {
  const h = ensureHex(hex).replace("#","");
  const factor = 1 - pct/100;
  const r = Math.round((parseInt(h.slice(0,2),16)||0)*factor);
  const g = Math.round((parseInt(h.slice(2,4),16)||0)*factor);
  const b = Math.round((parseInt(h.slice(4,6),16)||0)*factor);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}
function resolveBg(style: CarouselSlide["bg_style"], primary: string, secondary: string): string {
  switch(style) {
    case "brand":  return ensureHex(primary);
    case "accent": return ensureHex(secondary);
    case "dark":   return "#0f0f0f";
    case "light":  return "#f5f4ff";
    default:       return ensureHex(primary);
  }
}
function contrastText(bg: string): string {
  const h = bg.replace("#","");
  const r = parseInt(h.slice(0,2),16)||0, g=parseInt(h.slice(2,4),16)||0, b=parseInt(h.slice(4,6),16)||0;
  const lum = (0.299*r + 0.587*g + 0.114*b)/255;
  return lum > 0.55 ? "#111111" : "#ffffff";
}
export function isBgDark(bg: string): boolean { return contrastText(bg) === "#ffffff"; }

function headlineFontSize(text: string): number {
  const l = text.length;
  if (l <= 12) return 96;
  if (l <= 20) return 82;
  if (l <= 30) return 70;
  if (l <= 40) return 60;
  return 52;
}
function splitHeadline(text: string): [string, string] {
  const words = text.toUpperCase().trim().split(/\s+/);
  if (words.length <= 3) return [words.join(" "), ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

// ── Satori config ─────────────────────────────────────────────────────────────
function satoriConfig(fonts: FontCache): Parameters<typeof satori>[1] {
  return {
    width: SLIDE_W, height: SLIDE_H,
    fonts: [
      { name: "Montserrat", data: fonts.montserrat900, weight: 900, style: "normal" },
      { name: "Inter",      data: fonts.inter700,      weight: 700, style: "normal" },
    ],
  };
}
async function renderOverlay(element: React.ReactElement, fonts: FontCache): Promise<Buffer> {
  const svg = await satori(element, satoriConfig(fonts));
  const png = new Resvg(svg, { fitTo: { mode: "width", value: SLIDE_W } }).render().asPng();
  return Buffer.from(png);
}

// ── Shared UI elements ────────────────────────────────────────────────────────
function SlideCounter({ current, total, textColor }: { current: number; total: number; textColor: string }) {
  return (
    <div style={{
      position: "absolute", top: 40, right: 48,
      backgroundColor: "rgba(0,0,0,0.32)", borderRadius: 40,
      padding: "10px 24px", display: "flex", alignItems: "center",
    }}>
      <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: textColor, letterSpacing: 1 }}>
        {String(current).padStart(2,"0")} / {String(total).padStart(2,"0")}
      </span>
    </div>
  );
}

function BrandStrip({ clientName, handle, primary, secondary }: {
  clientName: string; handle: string; primary: string; secondary: string;
}) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 96,
      backgroundColor: ensureHex(primary),
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 56px",
    }}>
      <span style={{ color: "#fff", fontSize: 28, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1.5 }}>
        {clientName.toUpperCase()}
      </span>
      {handle && (
        <span style={{ color: ensureHex(secondary), fontSize: 28, fontFamily: "Inter", fontWeight: 700 }}>
          @{handle.replace(/^@/,"")}
        </span>
      )}
    </div>
  );
}

// ── HOOK SLIDE overlay (fundo = imagem AI ou crop panorâmico) ─────────────────
function buildHookOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Gradient overlay */}
      <div style={{
        position: "absolute", bottom: 96, left: 0, right: 0,
        height: Math.round(SLIDE_H * 0.65),
        background: `linear-gradient(to bottom, ${hexToRgba(primary,0)} 0%, ${hexToRgba(primary,0.60)} 50%, ${hexToRgba(primary,0.96)} 100%)`,
        display: "flex",
      }} />

      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />
      <SlideCounter current={slideNum} total={total} textColor="#ffffff" />

      {/* Swipe hint */}
      <div style={{ position: "absolute", bottom: 112, right: 48, display: "flex", alignItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 20, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
          Deslize ≡
        </span>
      </div>

      {/* Headline */}
      <div style={{ position: "absolute", bottom: 178, left: 52, right: 52, display: "flex", flexDirection: "column" }}>
        {slide.subheadline && (
          <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.78)", marginBottom: 10, lineHeight: 1.3 }}>
            {slide.subheadline}
          </span>
        )}
        <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: "#ffffff", lineHeight: 1.0, letterSpacing: -1 }}>
          {line1}
        </span>
        {line2 && (
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -1 }}>
            {line2}
          </span>
        )}
      </div>

      {/* Logo placeholder — sem fundo */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 80, width: 200, display: "flex" }} />
    </div>
  );
}

// ── SOLID CONTENT SLIDE (sem imagem de fundo) ─────────────────────────────────
function buildSolidContentOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const bg        = resolveBg(slide.bg_style, primary, secondary);
  const textColor = contrastText(bg);
  const dark      = isBgDark(bg);
  const accentColor = dark ? secondary : darken(secondary, 20);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>
      {/* Accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: accentColor }} />

      <SlideCounter current={slideNum} total={total} textColor={dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)"} />

      {/* Content */}
      <div style={{
        position: "absolute", top: 130, left: 56, right: 56, bottom: 96,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {slide.icon_emoji && <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 20, display: "flex" }}>{slide.icon_emoji}</div>}
        {slide.number_highlight && (
          <div style={{ fontSize: 150, fontWeight: 900, fontFamily: "Montserrat", color: accentColor, lineHeight: 0.85, marginBottom: 10, display: "flex" }}>
            {slide.number_highlight}
          </div>
        )}
        {slide.subheadline && (
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "Inter", color: dark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.50)", letterSpacing: 2.5, textTransform: "uppercase" as const, marginBottom: 14, display: "flex" }}>
            {slide.subheadline}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: textColor, lineHeight: 1.0, letterSpacing: -1, textAlign: "center" as const }}>
            {line1}
          </span>
          {line2 && (
            <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: accentColor, lineHeight: 1.05, letterSpacing: -1, textAlign: "center" as const }}>
              {line2}
            </span>
          )}
        </div>
        {slide.body_text && (
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "Inter", color: dark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.72)", lineHeight: 1.50, textAlign: "center" as const, marginTop: 24, maxWidth: 900, display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }}>
            {slide.body_text}
          </div>
        )}
      </div>

      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />
      {/* Logo placeholder */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 70, width: 200, display: "flex" }} />
    </div>
  );
}

// ── PHOTO CONTENT SLIDE overlay (fundo = foto da marca ou panorâmica) ─────────
// Renderizado sobre um fundo escuro — sem backgroundColor próprio (transparente)
function buildPhotoContentOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Dark overlay para legibilidade */}
      <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.48)", display: "flex" }} />

      {/* Gradient mais forte na área do texto */}
      <div style={{
        position: "absolute", bottom: 96, left: 0, right: 0, height: Math.round(SLIDE_H * 0.55),
        background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.70) 100%)",
        display: "flex",
      }} />

      {/* Accent line no topo */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: secondary }} />

      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />
      <SlideCounter current={slideNum} total={total} textColor="rgba(255,255,255,0.75)" />

      {/* Content — centered */}
      <div style={{
        position: "absolute", top: 120, left: 52, right: 52, bottom: 96,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {slide.icon_emoji && <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 20, display: "flex" }}>{slide.icon_emoji}</div>}
        {slide.number_highlight && (
          <div style={{ fontSize: 150, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 0.85, marginBottom: 10, display: "flex" }}>
            {slide.number_highlight}
          </div>
        )}
        {slide.subheadline && (
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.68)", letterSpacing: 2.5, textTransform: "uppercase" as const, marginBottom: 14, display: "flex" }}>
            {slide.subheadline}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: "#ffffff", lineHeight: 1.0, letterSpacing: -1, textAlign: "center" as const }}>
            {line1}
          </span>
          {line2 && (
            <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -1, textAlign: "center" as const }}>
              {line2}
            </span>
          )}
        </div>
        {slide.body_text && (
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.85)", lineHeight: 1.50, textAlign: "center" as const, marginTop: 24, maxWidth: 900, display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }}>
            {slide.body_text}
          </div>
        )}
      </div>

      {/* Logo placeholder */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 70, width: 200, display: "flex" }} />
    </div>
  );
}

// ── PANORAMIC CONTINUATION SLIDE overlay (slide 1 — direita do panorâmico) ────
// Visual idêntico ao hook (gradiente da cor primária) para efeito de continuidade
// ao deslizar o carrossel. Só o conteúdo muda — o estilo permanece coerente.
function buildPanoramicContinuationOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Gradiente de marca idêntico ao hook — continuidade visual */}
      <div style={{
        position: "absolute", bottom: 96, left: 0, right: 0,
        height: Math.round(SLIDE_H * 0.65),
        background: `linear-gradient(to bottom, ${hexToRgba(primary,0)} 0%, ${hexToRgba(primary,0.58)} 50%, ${hexToRgba(primary,0.94)} 100%)`,
        display: "flex",
      }} />
      {/* Suave overlay no topo para legibilidade */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: Math.round(SLIDE_H * 0.28),
        background: `linear-gradient(to bottom, ${hexToRgba(primary,0.38)} 0%, transparent 100%)`,
        display: "flex",
      }} />

      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />
      <SlideCounter current={slideNum} total={total} textColor="#ffffff" />

      {/* Conteúdo centralizado — mesma zona de texto do hook */}
      <div style={{
        position: "absolute", top: 120, left: 52, right: 52, bottom: 112,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        {slide.icon_emoji && (
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 20, display: "flex" }}>
            {slide.icon_emoji}
          </div>
        )}
        {slide.subheadline && (
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.78)", letterSpacing: 2.5, textTransform: "uppercase" as const, marginBottom: 14, display: "flex" }}>
            {slide.subheadline}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: "#ffffff", lineHeight: 1.0, letterSpacing: -1, textAlign: "center" as const }}>
            {line1}
          </span>
          {line2 && (
            <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -1, textAlign: "center" as const }}>
              {line2}
            </span>
          )}
        </div>
        {slide.body_text && (
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.85)", lineHeight: 1.50, textAlign: "center" as const, marginTop: 24, maxWidth: 900, display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }}>
            {slide.body_text}
          </div>
        )}
      </div>
      {/* Logo placeholder */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 80, width: 200, display: "flex" }} />
    </div>
  );
}

// ── CTA SLIDE overlay ─────────────────────────────────────────────────────────
function buildCTAOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const bg        = darken(primary, 10);

  return (
    <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>
      {/* Radial glow */}
      <div style={{ position: "absolute", top: "18%", left: "50%", width: 700, height: 700, borderRadius: "50%", background: `radial-gradient(circle, ${hexToRgba(secondary,0.20)} 0%, transparent 70%)`, transform: "translateX(-50%)", display: "flex" }} />

      <SlideCounter current={slideNum} total={total} textColor="rgba(255,255,255,0.55)" />

      <div style={{ position: "absolute", top: 130, left: 56, right: 56, bottom: 96, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {slide.icon_emoji && <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 28, display: "flex" }}>{slide.icon_emoji}</div>}
        <div style={{ fontSize: headlineFontSize(slide.headline), fontWeight: 900, fontFamily: "Montserrat", color: "#ffffff", lineHeight: 1.0, letterSpacing: -1, textAlign: "center" as const, display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }}>
          {slide.headline.toUpperCase()}
        </div>
        {slide.subheadline && (
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "Inter", color: secondary, lineHeight: 1.40, textAlign: "center" as const, marginTop: 20, maxWidth: 880, display: "flex", flexWrap: "wrap" as const, justifyContent: "center" }}>
            {slide.subheadline}
          </div>
        )}
        {slide.cta_text && (
          <div style={{ marginTop: 48, backgroundColor: secondary, borderRadius: 64, padding: "26px 64px", display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 32, color: contrastText(ensureHex(secondary)), letterSpacing: 0.5 }}>
              {slide.cta_text}
            </span>
          </div>
        )}
      </div>

      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />
      {/* Logo placeholder */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 70, width: 200, display: "flex" }} />
    </div>
  );
}

// ── Composite logo via sharp ──────────────────────────────────────────────────
async function compositeLogo(
  base: Buffer,
  logoUrl: string | null | undefined,
  logoWhiteUrl: string | null | undefined,
  dark: boolean,
): Promise<Buffer> {
  const url = dark && logoWhiteUrl ? logoWhiteUrl : logoUrl;
  if (!url) return base;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return base;

    let logoSharp = sharp(Buffer.from(await r.arrayBuffer()))
      .resize(200, 70, { fit: "inside", withoutEnlargement: false });

    if (dark && !logoWhiteUrl) {
      logoSharp = logoSharp.negate({ alpha: false });
    }

    const logo = await logoSharp.png().toBuffer();
    return await sharp(base).composite([{ input: logo, top: 44, left: 50 }]).toBuffer();
  } catch { return base; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ComposeHookSlideOptions {
  /** Buffer da imagem (já baixada e cortada se panorâmica). */
  imageBuffer:  Buffer;
  slide:        CarouselSlide;
  client:       BrandProfile;
  slideNum:     number;
  total:        number;
  carouselId:   string;
}

export interface ComposeContentSlideOptions {
  slide:          CarouselSlide;
  client:         BrandProfile;
  slideNum:       number;
  total:          number;
  carouselId:     string;
  /** Se fornecido: usa como fundo (panorâmica ou foto da marca). */
  bgImageBuffer?: Buffer;
  /**
   * Quando true: este slide é a continuação panorâmica do hook (metade direita).
   * Usa gradiente de marca idêntico ao hook para continuidade visual.
   */
  isPanoramicContinuation?: boolean;
}

/** Composes hook slide — imageBuffer is the pre-cropped background. */
export async function composeHookSlide(opts: ComposeHookSlideOptions): Promise<string> {
  const fonts   = await ensureFonts();
  const overlay = buildHookOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  const ovPng   = await renderOverlay(overlay, fonts);

  const bg = await sharp(opts.imageBuffer)
    .resize(SLIDE_W, SLIDE_H, { fit: "cover", position: "attention" })
    .toBuffer();

  let composed = await sharp(bg)
    .composite([{ input: ovPng, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  // Hook tem fundo escuro — sempre usa versão branca da logo
  composed = await compositeLogo(composed, opts.client.logo_url, opts.client.logo_white_url, true);

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}

/** Composes a content or CTA slide. If bgImageBuffer is provided, uses photo/panoramic background. */
export async function composeContentSlide(opts: ComposeContentSlideOptions): Promise<string> {
  const fonts = await ensureFonts();

  const primary   = ensureHex(opts.client.primary_color);
  const secondary = ensureHex(opts.client.secondary_color);
  const isCTA                  = opts.slide.type === "cta";
  const hasBgImage             = !!opts.bgImageBuffer;
  const isPanoramicContinuation = opts.isPanoramicContinuation === true;

  // Determine darkness for logo selection
  const solidBg   = isCTA ? darken(primary, 10) : resolveBg(opts.slide.bg_style, primary, secondary);
  const dark       = hasBgImage ? true : isBgDark(solidBg); // photo bg is always dark

  let element: React.ReactElement;
  if (isCTA) {
    element = buildCTAOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  } else if (isPanoramicContinuation && hasBgImage) {
    // Continuação panorâmica — usa gradiente de marca (não overlay preto)
    element = buildPanoramicContinuationOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  } else if (hasBgImage) {
    element = buildPhotoContentOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  } else {
    element = buildSolidContentOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  }

  const ovPng = await renderOverlay(element, fonts);

  let composed: Buffer;
  if (hasBgImage && opts.bgImageBuffer) {
    // Composite text overlay over photo/panoramic background
    const bg = await sharp(opts.bgImageBuffer)
      .resize(SLIDE_W, SLIDE_H, { fit: "cover", position: "attention" })
      .toBuffer();
    composed = await sharp(bg)
      .composite([{ input: ovPng, top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();
  } else {
    // Solid color — satori fills the entire canvas
    composed = await sharp(ovPng).jpeg({ quality: 95 }).toBuffer();
  }

  composed = await compositeLogo(composed, opts.client.logo_url, opts.client.logo_white_url, dark);

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}
