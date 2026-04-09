/**
 * lib/composer-linkedin.ts
 *
 * LinkedIn-specific compositors.
 *
 * composeLinkedInPost
 *   1200×628 landscape — AI image background + logo corner, no text overlay.
 *   LinkedIn post images should be clean visuals; copy lives in the text post.
 *
 * composeLinkedInCarouselSlide
 *   1080×1080 square — brand primary color background, headline (Montserrat 900),
 *   optional subheadline/body (Inter 700), slide counter badge, logo corner.
 *
 * Stack: sharp (resize + composite + logo) — no satori/SVG needed for post.
 *        satori + @resvg/resvg-js + sharp for carousel text slides.
 */

import React from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { uploadToR2 } from "./r2";

// ── Font helpers (shared CDN pattern from composer.tsx) ────────────────────────

let _montserrat: ArrayBuffer | null = null;
let _inter700:   ArrayBuffer | null = null;
let _inter500:   ArrayBuffer | null = null;

async function fetchSafe(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return r.ok ? r.arrayBuffer() : null;
  } catch { return null; }
}

async function ensureFonts(): Promise<{ montserrat: ArrayBuffer; inter700: ArrayBuffer; inter500: ArrayBuffer | null }> {
  if (_montserrat && _inter700) {
    return { montserrat: _montserrat, inter700: _inter700, inter500: _inter500 };
  }
  const [m, i7, i5] = await Promise.all([
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/static/Montserrat-Black.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Medium.ttf"),
  ]);

  const mFallback = m ? null : await fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/montserrat@4/files/montserrat-latin-900-normal.woff");
  const iFallback = i7 ? null : await fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/inter@4/files/inter-latin-700-normal.woff");

  const montserrat = m ?? mFallback;
  const inter700   = i7 ?? iFallback;
  if (!montserrat) throw new Error("[composer-linkedin] Falha ao carregar Montserrat 900");
  if (!inter700)   throw new Error("[composer-linkedin] Falha ao carregar Inter 700");

  _montserrat = montserrat;
  _inter700   = inter700;
  _inter500   = i5;
  return { montserrat, inter700, inter500: i5 };
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function ensureHex(color: string): string {
  if (!color) return "#1e40af";
  return color.startsWith("#") ? color : `#${color}`;
}

/** Lightness 0-1 of a hex color (rough approximation via luminance). */
function isLight(hex: string): boolean {
  const h = ensureHex(hex).replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LinkedInSlide {
  headline:    string;
  subheadline?: string | null;
  body?:        string | null;
}

export interface ComposeLinkedInPostOptions {
  /** URL or null — when null, produces a branded color placeholder */
  imageUrl:     string | null;
  logoUrl?:     string | null;
  primaryColor: string;
  postId:       string;
}

export interface ComposeLinkedInCarouselSlideOptions {
  slide:        LinkedInSlide;
  idx:          number;   // 0-based
  total:        number;
  logoUrl?:     string | null;
  clientName:   string;
  primaryColor: string;
  secondaryColor: string;
  postId:       string;
}

// ─────────────────────────────────────────────────────────────────────────────
// composeLinkedInPost — 1200×628 landscape
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches an image URL and returns its buffer (or null on failure).
 */
async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

/**
 * Fetches a logo, resizes to fit within maxW×maxH, returns PNG buffer.
 */
async function fetchLogoBuffer(logoUrl: string, maxW: number, maxH: number): Promise<Buffer | null> {
  const buf = await fetchBuffer(logoUrl);
  if (!buf) return null;
  try {
    return await sharp(buf)
      .resize(maxW, maxH, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch { return null; }
}

export async function composeLinkedInPost(opts: ComposeLinkedInPostOptions): Promise<string> {
  const W = 1200, H = 628;
  const primary = ensureHex(opts.primaryColor);

  let base: sharp.Sharp;

  if (opts.imageUrl) {
    const buf = await fetchBuffer(opts.imageUrl);
    if (buf) {
      base = sharp(buf).resize(W, H, { fit: "cover", position: "center" });
    } else {
      // Fallback: solid brand color
      base = sharp({ create: { width: W, height: H, channels: 3, background: primary } }).png();
    }
  } else {
    base = sharp({ create: { width: W, height: H, channels: 3, background: primary } }).png();
  }

  const composites: sharp.OverlayOptions[] = [];

  // Logo — bottom-right corner, small
  if (opts.logoUrl) {
    const logoBuf = await fetchLogoBuffer(opts.logoUrl, 160, 80);
    if (logoBuf) {
      const meta = await sharp(logoBuf).metadata();
      const lw = meta.width ?? 160;
      const lh = meta.height ?? 80;
      composites.push({
        input:     logoBuf,
        left:      W - lw - 24,
        top:       H - lh - 24,
        blend:     "over",
      });
    }
  }

  const jpeg = await base
    .jpeg({ quality: 90 })
    .composite(composites)
    .toBuffer();

  return uploadToR2(`posts/${opts.postId}/linkedin-post.jpg`, jpeg, "image/jpeg");
}

// ─────────────────────────────────────────────────────────────────────────────
// composeLinkedInCarouselSlide — 1080×1080 square
// ─────────────────────────────────────────────────────────────────────────────

export async function composeLinkedInCarouselSlide(
  opts: ComposeLinkedInCarouselSlideOptions
): Promise<string> {
  const W = 1080, H = 1080;
  const primary   = ensureHex(opts.primaryColor);
  const secondary = ensureHex(opts.secondaryColor);

  // Text color: white on dark bg, dark on light bg
  const onPrimary   = isLight(primary)   ? "#111827" : "#ffffff";
  const onSecondary = isLight(secondary) ? "#111827" : "#ffffff";

  const fonts = await ensureFonts();

  // Slide counter label e.g. "01 / 07"
  const counter = `${String(opts.idx + 1).padStart(2, "0")} / ${String(opts.total).padStart(2, "0")}`;

  // Cover slide (idx 0) — larger headline, secondary color accent bar
  const isCover = opts.idx === 0;

  const svgStr = await satori(
    React.createElement(
      "div",
      {
        style: {
          width:           W,
          height:          H,
          background:      primary,
          display:         "flex",
          flexDirection:   "column",
          justifyContent:  "space-between",
          padding:         "72px",
          fontFamily:      "'Montserrat', 'Inter', sans-serif",
          position:        "relative",
          boxSizing:       "border-box",
        },
      },
      // Top: counter badge
      React.createElement(
        "div",
        {
          style: {
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
          },
        },
        React.createElement(
          "span",
          {
            style: {
              fontFamily:  "'Inter', sans-serif",
              fontWeight:  700,
              fontSize:    28,
              color:       hexWithOpacity(onPrimary, 0.5),
              letterSpacing: "0.1em",
            },
          },
          counter
        ),
        // Client name top-right
        React.createElement(
          "span",
          {
            style: {
              fontFamily:  "'Inter', sans-serif",
              fontWeight:  700,
              fontSize:    24,
              color:       hexWithOpacity(onPrimary, 0.6),
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            },
          },
          opts.clientName
        )
      ),

      // Middle: main content
      React.createElement(
        "div",
        {
          style: {
            display:       "flex",
            flexDirection: "column",
            gap:           "32px",
            flex:          1,
            justifyContent: "center",
          },
        },
        // Accent bar for cover slide
        isCover
          ? React.createElement("div", {
              style: {
                width:        80,
                height:       6,
                background:   secondary,
                borderRadius: 3,
              },
            })
          : null,

        // Headline
        React.createElement(
          "span",
          {
            style: {
              fontFamily:  "'Montserrat', sans-serif",
              fontWeight:  900,
              fontSize:    isCover ? 88 : 72,
              color:       onPrimary,
              lineHeight:  1.05,
              letterSpacing: "-0.02em",
            },
          },
          opts.slide.headline
        ),

        // Subheadline
        opts.slide.subheadline
          ? React.createElement(
              "span",
              {
                style: {
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 700,
                  fontSize:   38,
                  color:      hexWithOpacity(onPrimary, 0.75),
                  lineHeight: 1.3,
                },
              },
              opts.slide.subheadline
            )
          : null,

        // Body
        opts.slide.body
          ? React.createElement(
              "span",
              {
                style: {
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 500,
                  fontSize:   32,
                  color:      hexWithOpacity(onPrimary, 0.65),
                  lineHeight: 1.55,
                },
              },
              opts.slide.body
            )
          : null,
      ),

      // Bottom accent bar
      React.createElement("div", {
        style: {
          width:        "100%",
          height:       8,
          background:   secondary,
          borderRadius: 4,
        },
      })
    ),
    {
      width:  W,
      height: H,
      fonts: [
        { name: "Montserrat", data: fonts.montserrat, weight: 900 as const, style: "normal" as const },
        { name: "Inter",      data: fonts.inter700,   weight: 700 as const, style: "normal" as const },
        ...(fonts.inter500
          ? [{ name: "Inter", data: fonts.inter500, weight: 500 as const, style: "normal" as const }]
          : []),
      ],
    }
  );

  // SVG → PNG
  const resvg = new Resvg(svgStr, { fitTo: { mode: "width" as const, value: W } });
  const pngData = resvg.render();
  const pngBuffer = Buffer.from(pngData.asPng());

  const composites: sharp.OverlayOptions[] = [];

  // Logo — bottom-right, small
  if (opts.logoUrl) {
    const logoBuf = await fetchLogoBuffer(opts.logoUrl, 140, 70);
    if (logoBuf) {
      const meta = await sharp(logoBuf).metadata();
      const lw = meta.width ?? 140;
      const lh = meta.height ?? 70;
      composites.push({
        input: logoBuf,
        left:  W - lw - 72,
        top:   H - lh - 72,
        blend: "over",
      });
    }
  }

  const jpeg = await sharp(pngBuffer)
    .resize(W, H)
    .jpeg({ quality: 92 })
    .composite(composites)
    .toBuffer();

  const r2Key = `posts/${opts.postId}/linkedin-slide-${String(opts.idx + 1).padStart(2, "0")}.jpg`;
  return uploadToR2(r2Key, jpeg, "image/jpeg");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hexWithOpacity(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
