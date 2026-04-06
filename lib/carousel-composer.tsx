/**
 * lib/carousel-composer.tsx
 *
 * Compositor de slides de carrossel para Instagram.
 * Todos os slides são quadrados (1080×1080).
 *
 * Stack: satori → SVG → resvg → PNG overlay → sharp composite → JPEG → R2
 *
 * Tipos de slide:
 *   hook     — slide 0: imagem AI como fundo + overlay com headline
 *   content  — slides intermediários: fundo sólido + texto
 *   cta      — último slide: fundo sólido + CTA centralizado
 */

import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { uploadToR2 } from "./r2";
import type { CarouselSlide, BrandProfile } from "@/types";

// ── Dimensões ─────────────────────────────────────────────────────────────────
const W = 1080;
const H = 1080;

// ── Font cache (shared with composer.tsx warm invocations) ────────────────────
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
function ensureHex(c: string): string { return c?.startsWith("#") ? c : `#${c ?? "6d28d9"}`; }
function hexToRgba(hex: string, a: number): string {
  const h = ensureHex(hex).replace("#","");
  const r = parseInt(h.slice(0,2),16)||0, g=parseInt(h.slice(2,4),16)||0, b=parseInt(h.slice(4,6),16)||0;
  return `rgba(${r},${g},${b},${a})`;
}

// Darkens hex color by percent (0-100)
function darken(hex: string, pct: number): string {
  const h = ensureHex(hex).replace("#","");
  const factor = 1 - pct/100;
  const r = Math.round((parseInt(h.slice(0,2),16)||0)*factor);
  const g = Math.round((parseInt(h.slice(2,4),16)||0)*factor);
  const b = Math.round((parseInt(h.slice(4,6),16)||0)*factor);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

// Resolve background color from bg_style
function resolveBg(style: CarouselSlide["bg_style"], primary: string, secondary: string): string {
  switch(style) {
    case "brand":  return ensureHex(primary);
    case "accent": return ensureHex(secondary);
    case "dark":   return "#0f0f0f";
    case "light":  return "#f5f4ff";
    default:       return ensureHex(primary);
  }
}

// Choose text color that contrasts with bg
function contrastText(bg: string): string {
  const h = bg.replace("#","");
  const r = parseInt(h.slice(0,2),16)||0, g=parseInt(h.slice(2,4),16)||0, b=parseInt(h.slice(4,6),16)||0;
  const lum = (0.299*r + 0.587*g + 0.114*b)/255;
  return lum > 0.55 ? "#111111" : "#ffffff";
}

// Auto-scale headline font size
function headlineFontSize(text: string): number {
  const l = text.length;
  if (l <= 15) return 88;
  if (l <= 25) return 72;
  if (l <= 35) return 60;
  return 52;
}

function splitHeadline(text: string): [string, string] {
  const words = text.toUpperCase().trim().split(/\s+/);
  if (words.length <= 3) return [words.join(" "), ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

// ── Satori font config helper ─────────────────────────────────────────────────
function satoriConfig(fonts: FontCache): Parameters<typeof satori>[1] {
  return {
    width: W, height: H,
    fonts: [
      { name: "Montserrat", data: fonts.montserrat900, weight: 900, style: "normal" },
      { name: "Inter",      data: fonts.inter700,      weight: 700, style: "normal" },
    ],
  };
}

// ── Render overlay → PNG buffer via satori + resvg ────────────────────────────
async function renderOverlay(element: React.ReactElement, fonts: FontCache): Promise<Buffer> {
  const svg = await satori(element, satoriConfig(fonts));
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  return Buffer.from(png);
}

// ── Slide counter pill element ────────────────────────────────────────────────
function SlideCounter({ current, total, textColor }: { current: number; total: number; textColor: string }) {
  return (
    <div style={{
      position: "absolute", top: 32, right: 40,
      backgroundColor: "rgba(0,0,0,0.28)", borderRadius: 40,
      padding: "8px 20px", display: "flex", alignItems: "center",
    }}>
      <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 22, color: textColor, letterSpacing: 1 }}>
        {String(current).padStart(2,"0")} / {String(total).padStart(2,"0")}
      </span>
    </div>
  );
}

// ── Brand strip element ───────────────────────────────────────────────────────
function BrandStrip({ clientName, handle, primary, secondary }: {
  clientName: string; handle: string; primary: string; secondary: string;
}) {
  const bg = ensureHex(primary);
  const acc = ensureHex(secondary);
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 90,
      backgroundColor: bg, borderTop: `3px solid ${acc}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 48px",
    }}>
      <span style={{ color: "#fff", fontSize: 26, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
        {clientName.toUpperCase()}
      </span>
      {handle && (
        <span style={{ color: acc, fontSize: 26, fontFamily: "Inter", fontWeight: 700 }}>
          @{handle.replace(/^@/,"")}
        </span>
      )}
    </div>
  );
}

// ── HOOK SLIDE overlay (satori template) ─────────────────────────────────────
function buildHookOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color ?? "#6d28d9");
  const secondary = ensureHex(client.secondary_color ?? "#f59e0b");
  const [line1, line2] = splitHeadline(slide.headline);
  const hasTwoLines    = !!line2;
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden" }}>
      {/* Gradient overlay */}
      <div style={{
        position: "absolute", bottom: 90, left: 0, right: 0, height: Math.round(H * 0.6),
        background: `linear-gradient(to bottom, ${hexToRgba(primary,0)} 0%, ${hexToRgba(primary,0.65)} 55%, ${hexToRgba(primary,0.95)} 100%)`,
        display: "flex",
      }} />

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor="#ffffff" />

      {/* Swipe hint */}
      <div style={{
        position: "absolute", bottom: 106, right: 40,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 18, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
          Deslize →
        </span>
      </div>

      {/* Headline */}
      <div style={{
        position: "absolute", bottom: 160, left: 48, right: 48,
        display: "flex", flexDirection: "column",
      }}>
        <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: "#ffffff", lineHeight: 1.0, letterSpacing: -1 }}>
          {line1}
        </span>
        {hasTwoLines && (
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -1 }}>
            {line2}
          </span>
        )}
        {slide.subheadline && (
          <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "Inter", color: "rgba(255,255,255,0.82)", marginTop: 12, lineHeight: 1.3 }}>
            {slide.subheadline}
          </span>
        )}
      </div>

      {/* Logo placeholder (filled by sharp composite) */}
      <div style={{
        position: "absolute", top: 32, left: 36, height: 80, minWidth: 48,
        backgroundColor: hexToRgba(primary, 0.72), borderRadius: 14,
        display: "flex", alignItems: "center", padding: "8px 16px",
      }} />
    </div>
  );
}

// ── CONTENT SLIDE element (pure satori — no background image) ─────────────────
function buildContentOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color ?? "#6d28d9");
  const secondary = ensureHex(client.secondary_color ?? "#f59e0b");
  const bg        = resolveBg(slide.bg_style, primary, secondary);
  const textColor = contrastText(bg);
  const accentColor = textColor === "#ffffff" ? secondary : darken(secondary, 20);

  const [line1, line2] = splitHeadline(slide.headline);
  const hasTwoLines    = !!line2;
  const fs = headlineFontSize(slide.headline);

  // Content block vertical centering: emoji at top third, then headline, then body
  const hasEmoji  = !!slide.icon_emoji;
  const hasNum    = !!slide.number_highlight;
  const hasBody   = !!slide.body_text;

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>
      {/* Subtle top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: accentColor }} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor={textColor === "#ffffff" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)"} />

      {/* Main content block — vertically centered */}
      <div style={{
        position: "absolute", top: 80, left: 48, right: 48, bottom: 90,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        {/* Emoji */}
        {hasEmoji && (
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 16, display: "flex" }}>
            {slide.icon_emoji}
          </div>
        )}

        {/* Number highlight */}
        {hasNum && (
          <div style={{ fontSize: 140, fontWeight: 900, fontFamily: "Montserrat", color: accentColor, lineHeight: 0.9, marginBottom: 8, display: "flex" }}>
            {slide.number_highlight}
          </div>
        )}

        {/* Subheadline */}
        {slide.subheadline && (
          <div style={{
            fontSize: 24, fontWeight: 700, fontFamily: "Inter",
            color: textColor === "#ffffff" ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.5)",
            letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 12,
            display: "flex",
          }}>
            {slide.subheadline}
          </div>
        )}

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: textColor, lineHeight: 1.0, letterSpacing: -1, textAlign: "center" as const }}>
            {line1}
          </span>
          {hasTwoLines && (
            <span style={{ fontSize: fs, fontWeight: 900, fontFamily: "Montserrat", color: accentColor, lineHeight: 1.05, letterSpacing: -1, textAlign: "center" as const }}>
              {line2}
            </span>
          )}
        </div>

        {/* Body text */}
        {hasBody && (
          <div style={{
            fontSize: 26, fontWeight: 700, fontFamily: "Inter",
            color: textColor === "#ffffff" ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.72)",
            lineHeight: 1.45, textAlign: "center" as const,
            marginTop: 20, maxWidth: 880,
            display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
          }}>
            {slide.body_text}
          </div>
        )}
      </div>

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Logo placeholder */}
      <div style={{
        position: "absolute", top: 32, left: 36, height: 64, minWidth: 40,
        backgroundColor: textColor === "#ffffff" ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.08)",
        borderRadius: 12, display: "flex", alignItems: "center", padding: "8px 14px",
      }} />
    </div>
  );
}

// ── CTA SLIDE element ─────────────────────────────────────────────────────────
function buildCTAOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color ?? "#6d28d9");
  const secondary = ensureHex(client.secondary_color ?? "#f59e0b");
  // CTA always uses brand bg
  const bg        = darken(primary, 10); // slightly darker for depth

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>
      {/* Radial glow */}
      <div style={{
        position: "absolute", top: "20%", left: "50%",
        width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${hexToRgba(secondary,0.18)} 0%, transparent 70%)`,
        transform: "translateX(-50%)",
        display: "flex",
      }} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor="rgba(255,255,255,0.6)" />

      {/* Center content */}
      <div style={{
        position: "absolute", top: 80, left: 48, right: 48, bottom: 90,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        {/* Emoji */}
        {slide.icon_emoji && (
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 24, display: "flex" }}>
            {slide.icon_emoji}
          </div>
        )}

        {/* Headline */}
        <div style={{
          fontSize: headlineFontSize(slide.headline), fontWeight: 900, fontFamily: "Montserrat",
          color: "#ffffff", lineHeight: 1.0, letterSpacing: -1,
          textAlign: "center" as const, display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
        }}>
          {slide.headline.toUpperCase()}
        </div>

        {/* Subheadline */}
        {slide.subheadline && (
          <div style={{
            fontSize: 28, fontWeight: 700, fontFamily: "Inter",
            color: secondary, lineHeight: 1.35, textAlign: "center" as const,
            marginTop: 16, maxWidth: 820,
            display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
          }}>
            {slide.subheadline}
          </div>
        )}

        {/* CTA Button */}
        {slide.cta_text && (
          <div style={{
            marginTop: 40,
            backgroundColor: secondary, borderRadius: 60,
            padding: "22px 56px", display: "flex", alignItems: "center",
          }}>
            <span style={{
              fontFamily: "Inter", fontWeight: 700, fontSize: 30,
              color: contrastText(ensureHex(secondary)),
              letterSpacing: 0.5,
            }}>
              {slide.cta_text}
            </span>
          </div>
        )}
      </div>

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Logo placeholder (large — composited by sharp) */}
      <div style={{
        position: "absolute", top: 32, left: 36, height: 64, minWidth: 40,
        backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12,
        display: "flex", alignItems: "center", padding: "8px 14px",
      }} />
    </div>
  );
}

// ── Composite logo via sharp ──────────────────────────────────────────────────
async function compositeLogo(
  base: Buffer, logoUrl: string | null | undefined
): Promise<Buffer> {
  if (!logoUrl) return base;
  try {
    const r = await fetch(logoUrl, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return base;
    const logo = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(200, 64, { fit: "inside" })
      .toBuffer();
    return await sharp(base).composite([{ input: logo, top: 44, left: 50 }]).toBuffer();
  } catch { return base; }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ComposeHookSlideOptions {
  imageUrl:    string;
  slide:       CarouselSlide;
  client:      BrandProfile;
  slideNum:    number;
  total:       number;
  carouselId:  string;
}

export interface ComposeContentSlideOptions {
  slide:       CarouselSlide;
  client:      BrandProfile;
  slideNum:    number;
  total:       number;
  carouselId:  string;
}

/** Composes hook slide (index 0) — requires AI-generated imageUrl as background. */
export async function composeHookSlide(opts: ComposeHookSlideOptions): Promise<string> {
  const fonts   = await ensureFonts();
  const overlay = buildHookOverlay(opts.slide, opts.client, opts.slideNum, opts.total);
  const ovPng   = await renderOverlay(overlay, fonts);

  // Background: download + resize to square
  const imgRes = await fetch(opts.imageUrl);
  if (!imgRes.ok) throw new Error(`[carousel-composer] Falha ao baixar imageUrl: ${imgRes.status}`);
  const bg = await sharp(Buffer.from(await imgRes.arrayBuffer()))
    .resize(W, H, { fit: "cover", position: "attention" })
    .toBuffer();

  let composed = await sharp(bg).composite([{ input: ovPng, top: 0, left: 0 }]).jpeg({ quality: 95 }).toBuffer();
  composed = await compositeLogo(composed, opts.client.logo_url);

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}

/** Composes a content or CTA slide — no external image needed. */
export async function composeContentSlide(opts: ComposeContentSlideOptions): Promise<string> {
  const fonts = await ensureFonts();

  const isCTA = opts.slide.type === "cta";
  const element = isCTA
    ? buildCTAOverlay(opts.slide, opts.client, opts.slideNum, opts.total)
    : buildContentOverlay(opts.slide, opts.client, opts.slideNum, opts.total);

  const ovPng = await renderOverlay(element, fonts);

  // Content slides don't need a background image — satori fills the entire canvas
  let composed = await sharp(ovPng).jpeg({ quality: 95 }).toBuffer();
  composed = await compositeLogo(composed, opts.client.logo_url);

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}
