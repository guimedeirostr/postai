/**
 * lib/carousel-composer.tsx
 *
 * Compositor de slides de carrossel para Instagram.
 * Formato: 1080×1350 (4:5) — padrão Instagram feed/carrossel.
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
const W = 1080;
const H = 1350;

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
function isDarkBg(bg: string): boolean { return contrastText(bg) === "#ffffff"; }

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
    width: W, height: H,
    fonts: [
      { name: "Montserrat", data: fonts.montserrat900, weight: 900, style: "normal" },
      { name: "Inter",      data: fonts.inter700,      weight: 700, style: "normal" },
    ],
  };
}

async function renderOverlay(element: React.ReactElement, fonts: FontCache): Promise<Buffer> {
  const svg = await satori(element, satoriConfig(fonts));
  const png = new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
  return Buffer.from(png);
}

// ── Slide counter ─────────────────────────────────────────────────────────────
function SlideCounter({ current, total, textColor }: { current: number; total: number; textColor: string }) {
  return (
    <div style={{
      position: "absolute", top: 40, right: 48,
      backgroundColor: "rgba(0,0,0,0.30)", borderRadius: 40,
      padding: "10px 24px", display: "flex", alignItems: "center",
    }}>
      <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: textColor, letterSpacing: 1 }}>
        {String(current).padStart(2,"0")} / {String(total).padStart(2,"0")}
      </span>
    </div>
  );
}

// ── Brand strip ───────────────────────────────────────────────────────────────
function BrandStrip({ clientName, handle, primary, secondary }: {
  clientName: string; handle: string; primary: string; secondary: string;
}) {
  const bg  = ensureHex(primary);
  const acc = ensureHex(secondary);
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 96,
      backgroundColor: bg,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 56px",
    }}>
      <span style={{ color: "#fff", fontSize: 28, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1.5 }}>
        {clientName.toUpperCase()}
      </span>
      {handle && (
        <span style={{ color: acc, fontSize: 28, fontFamily: "Inter", fontWeight: 700 }}>
          @{handle.replace(/^@/,"")}
        </span>
      )}
    </div>
  );
}

// ── HOOK SLIDE overlay ────────────────────────────────────────────────────────
function buildHookOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden" }}>

      {/* Gradient overlay — covers bottom 65% */}
      <div style={{
        position: "absolute", bottom: 96, left: 0, right: 0,
        height: Math.round(H * 0.65),
        background: `linear-gradient(to bottom, ${hexToRgba(primary,0)} 0%, ${hexToRgba(primary,0.60)} 50%, ${hexToRgba(primary,0.96)} 100%)`,
        display: "flex",
      }} />

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor="#ffffff" />

      {/* Swipe hint */}
      <div style={{
        position: "absolute", bottom: 112, right: 48,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ color: "rgba(255,255,255,0.78)", fontSize: 20, fontFamily: "Inter", fontWeight: 700, letterSpacing: 1 }}>
          Deslize ≡
        </span>
      </div>

      {/* Headline block */}
      <div style={{
        position: "absolute", bottom: 180, left: 52, right: 52,
        display: "flex", flexDirection: "column",
      }}>
        {slide.subheadline && (
          <span style={{
            fontSize: 26, fontWeight: 700, fontFamily: "Inter",
            color: "rgba(255,255,255,0.78)", marginBottom: 10, lineHeight: 1.3,
          }}>
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

      {/* Logo area — NO background, just reserve space; sharp composites logo here */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 80, width: 200, display: "flex" }} />
    </div>
  );
}

// ── CONTENT SLIDE overlay ─────────────────────────────────────────────────────
function buildContentOverlay(
  slide: CarouselSlide, client: BrandProfile, slideNum: number, total: number
): React.ReactElement {
  const primary   = ensureHex(client.primary_color);
  const secondary = ensureHex(client.secondary_color);
  const bg        = resolveBg(slide.bg_style, primary, secondary);
  const textColor = contrastText(bg);
  const dark      = isDarkBg(bg);
  const accentColor = dark ? secondary : darken(secondary, 20);
  const [line1, line2] = splitHeadline(slide.headline);
  const fs = headlineFontSize(slide.headline);

  return (
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>

      {/* Top accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: accentColor }} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor={dark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.45)"} />

      {/* Main content — vertically centered between logo area and brand strip */}
      <div style={{
        position: "absolute", top: 130, left: 56, right: 56, bottom: 96,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        {slide.icon_emoji && (
          <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 20, display: "flex" }}>
            {slide.icon_emoji}
          </div>
        )}
        {slide.number_highlight && (
          <div style={{ fontSize: 150, fontWeight: 900, fontFamily: "Montserrat", color: accentColor, lineHeight: 0.85, marginBottom: 10, display: "flex" }}>
            {slide.number_highlight}
          </div>
        )}
        {slide.subheadline && (
          <div style={{
            fontSize: 26, fontWeight: 700, fontFamily: "Inter",
            color: dark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.50)",
            letterSpacing: 2.5, textTransform: "uppercase" as const, marginBottom: 14,
            display: "flex",
          }}>
            {slide.subheadline}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
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
          <div style={{
            fontSize: 28, fontWeight: 700, fontFamily: "Inter",
            color: dark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.72)",
            lineHeight: 1.50, textAlign: "center" as const,
            marginTop: 24, maxWidth: 900,
            display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
          }}>
            {slide.body_text}
          </div>
        )}
      </div>

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Logo area — NO background; sharp composites logo here */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 70, width: 200, display: "flex" }} />
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
    <div style={{ width: W, height: H, display: "flex", position: "relative", overflow: "hidden", backgroundColor: bg }}>

      {/* Radial glow */}
      <div style={{
        position: "absolute", top: "18%", left: "50%",
        width: 700, height: 700, borderRadius: "50%",
        background: `radial-gradient(circle, ${hexToRgba(secondary,0.20)} 0%, transparent 70%)`,
        transform: "translateX(-50%)",
        display: "flex",
      }} />

      {/* Slide counter */}
      <SlideCounter current={slideNum} total={total} textColor="rgba(255,255,255,0.55)" />

      {/* Center content */}
      <div style={{
        position: "absolute", top: 130, left: 56, right: 56, bottom: 96,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 0,
      }}>
        {slide.icon_emoji && (
          <div style={{ fontSize: 88, lineHeight: 1, marginBottom: 28, display: "flex" }}>
            {slide.icon_emoji}
          </div>
        )}
        <div style={{
          fontSize: headlineFontSize(slide.headline), fontWeight: 900, fontFamily: "Montserrat",
          color: "#ffffff", lineHeight: 1.0, letterSpacing: -1,
          textAlign: "center" as const, display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
        }}>
          {slide.headline.toUpperCase()}
        </div>
        {slide.subheadline && (
          <div style={{
            fontSize: 30, fontWeight: 700, fontFamily: "Inter",
            color: secondary, lineHeight: 1.40, textAlign: "center" as const,
            marginTop: 20, maxWidth: 880,
            display: "flex", flexWrap: "wrap" as const, justifyContent: "center",
          }}>
            {slide.subheadline}
          </div>
        )}
        {slide.cta_text && (
          <div style={{
            marginTop: 48,
            backgroundColor: secondary, borderRadius: 64,
            padding: "26px 64px", display: "flex", alignItems: "center",
          }}>
            <span style={{
              fontFamily: "Inter", fontWeight: 700, fontSize: 32,
              color: contrastText(ensureHex(secondary)), letterSpacing: 0.5,
            }}>
              {slide.cta_text}
            </span>
          </div>
        )}
      </div>

      {/* Brand strip */}
      <BrandStrip clientName={client.name} handle={client.instagram_handle ?? ""} primary={primary} secondary={secondary} />

      {/* Logo area — NO background */}
      <div style={{ position: "absolute", top: 40, left: 44, height: 70, width: 200, display: "flex" }} />
    </div>
  );
}

// ── Composite logo via sharp ──────────────────────────────────────────────────
/**
 * Composites the brand logo onto the slide.
 * - If the background is dark and `logoWhiteUrl` is available, uses the white version.
 * - If the background is dark and no white logo, negates the original (dark→white).
 * - Always drops a subtle shadow pill behind the logo for contrast.
 */
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

    // If dark bg and no white logo available, negate colors to make logo appear white
    if (dark && !logoWhiteUrl) {
      logoSharp = logoSharp.negate({ alpha: false });
    }

    const logo = await logoSharp.png().toBuffer();
    return await sharp(base)
      .composite([{ input: logo, top: 44, left: 50 }])
      .toBuffer();
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

  // Background: download + resize to 4:5
  const imgRes = await fetch(opts.imageUrl);
  if (!imgRes.ok) throw new Error(`[carousel-composer] Falha ao baixar imageUrl: ${imgRes.status}`);
  const bg = await sharp(Buffer.from(await imgRes.arrayBuffer()))
    .resize(W, H, { fit: "cover", position: "attention" })
    .toBuffer();

  let composed = await sharp(bg)
    .composite([{ input: ovPng, top: 0, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer();

  // Hook slide has photo over it — logo on dark overlay → use white version
  composed = await compositeLogo(
    composed,
    opts.client.logo_url,
    opts.client.logo_white_url,
    true, // hook always has dark overlay
  );

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}

/** Composes a content or CTA slide — no external image needed. */
export async function composeContentSlide(opts: ComposeContentSlideOptions): Promise<string> {
  const fonts = await ensureFonts();

  const primary   = ensureHex(opts.client.primary_color);
  const secondary = ensureHex(opts.client.secondary_color);

  const isCTA = opts.slide.type === "cta";
  const bg = isCTA
    ? darken(primary, 10)
    : resolveBg(opts.slide.bg_style, primary, secondary);
  const dark = isDarkBg(bg);

  const element = isCTA
    ? buildCTAOverlay(opts.slide, opts.client, opts.slideNum, opts.total)
    : buildContentOverlay(opts.slide, opts.client, opts.slideNum, opts.total);

  const ovPng = await renderOverlay(element, fonts);

  let composed = await sharp(ovPng).jpeg({ quality: 95 }).toBuffer();
  composed = await compositeLogo(
    composed,
    opts.client.logo_url,
    opts.client.logo_white_url,
    dark,
  );

  const key = `carousels/${opts.carouselId}/slide-${opts.slide.index}.jpg`;
  return uploadToR2(key, composed, "image/jpeg");
}
