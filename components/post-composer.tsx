"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandProfile, GeneratedPost } from "@/types";

const FORMAT_PX: Record<string, { w: number; h: number }> = {
  feed:        { w: 1080, h: 1350 },
  stories:     { w: 1080, h: 1920 },
  reels_cover: { w: 1080, h: 1920 },
};

type Template = "gradient" | "cards" | "bold";

const TEMPLATES: { id: Template; label: string; icon: string }[] = [
  { id: "gradient", label: "Gradiente",  icon: "🌅" },
  { id: "cards",    label: "Cards",      icon: "🎨" },
  { id: "bold",     label: "Negrito",    icon: "⚡" },
];

// ─── Colour helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 109, g: 40, b: 217 };
}
function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function contrastColor(hex: string): string {
  return getLuminance(hex) > 0.45 ? "#1a1a1a" : "#ffffff";
}

// ─── Canvas helpers ────────────────────────────────────────────────────────────
const FONT = "Montserrat, 'Arial Black', Arial, sans-serif";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Splits visual_headline into [teaser, main] for the Cards template */
function splitHeadline(text: string): [string, string] {
  // Try natural punctuation split (. ! ?)
  const m = text.match(/^([^.!?]+[.!?])\s*([\s\S]+)$/);
  if (m && m[2].trim().length > 2) return [m[1].trim(), m[2].trim()];

  // Split by line break
  const lines = text.split(/\n/);
  if (lines.length >= 2) return [lines[0].trim(), lines.slice(1).join(" ").trim()];

  // Fallback: split at ~40% of words
  const words = text.split(" ");
  if (words.length <= 3) return ["", text];
  const cut = Math.max(2, Math.round(words.length * 0.4));
  return [words.slice(0, cut).join(" "), words.slice(cut).join(" ")];
}

/** Cover-fit: returns drawImage crop params */
function coverFit(img: HTMLImageElement, cw: number, ch: number) {
  const iR = img.width / img.height;
  const cR = cw / ch;
  let sx = 0, sy = 0, sw = img.width, sh = img.height;
  if (iR > cR) { sw = img.height * cR; sx = (img.width - sw) / 2; }
  else          { sh = img.width  / cR; sy = (img.height - sh) / 2; }
  return { sx, sy, sw, sh };
}

/** Draw text inside a solid box, returns box height */
function drawBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number, y: number,
  opts: {
    bgColor: string; textColor: string;
    fontSize: number; fontWeight: string;
    padX: number; padY: number;
    maxW: number; lineHeightMult?: number;
  }
): number {
  const { bgColor, textColor, fontSize, fontWeight, padX, padY, maxW, lineHeightMult = 1.2 } = opts;
  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
  const lines = wrapText(ctx, text, maxW - padX * 2);
  const lh = fontSize * lineHeightMult;
  const boxH = lines.length * lh + padY * 2;

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, maxW, boxH);

  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  lines.forEach((line, i) => ctx.fillText(line, x + padX, y + padY + i * lh, maxW - padX * 2));
  return boxH;
}

/** Load logo image, returns null on failure */
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ─── Templates ─────────────────────────────────────────────────────────────────

function drawGradient(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  overlayOpacity: number, showHook: boolean, showLogo: boolean
) {
  // Brand overlay
  if (overlayOpacity > 0) {
    const { r, g, b } = hexToRgb(client.primary_color);
    ctx.fillStyle = `rgba(${r},${g},${b},${overlayOpacity / 100})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (!showHook) {
    // Just logo
    if (showLogo && logo) drawLogoBottomLeft(ctx, logo, w, h);
    return;
  }

  // Gradient
  const grad = ctx.createLinearGradient(0, h * 0.5, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.80)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const pad       = Math.round(w * 0.07);
  const fontSize  = Math.round(w * 0.076);
  const maxWidth  = w - pad * 2;
  const lineH     = fontSize * 1.25;
  const logoH     = showLogo && logo ? Math.round(h * 0.065) : 0;
  const logoGap   = logoH ? Math.round(pad * 0.6) : 0;

  ctx.font         = `800 ${fontSize}px ${FONT}`;
  ctx.fillStyle    = "#ffffff";
  ctx.textBaseline = "bottom";
  ctx.shadowColor  = "rgba(0,0,0,0.7)";
  ctx.shadowBlur   = 14;

  const text  = post.visual_headline || post.headline;
  const lines = wrapText(ctx, text, maxWidth);
  let y = h - pad - logoH - logoGap;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y, maxWidth);
    y -= lineH;
  }
  ctx.shadowBlur = 0;

  if (showLogo && logo) drawLogoBottomLeft(ctx, logo, w, h);
}

function drawCards(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  showLogo: boolean
) {
  const primary   = client.primary_color;
  const secondary = client.secondary_color;
  const padX      = Math.round(w * 0.07);
  const stripH    = Math.round(h * 0.105);

  // Subtle dark veil over photo
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, w, h);

  const [teaser, main] = splitHeadline(post.visual_headline || post.headline);

  // ─ Measure boxes (dry run) ──────────────────────────────────────────────────
  const tFS = Math.round(w * 0.054);
  const mFS = Math.round(w * 0.086);

  ctx.font = `700 ${tFS}px ${FONT}`;
  const tLines = teaser ? wrapText(ctx, teaser, w - padX * 2) : [];
  const tLineH = tFS * 1.3;
  const tPadY  = Math.round(tFS * 0.55);
  const tBoxH  = tLines.length ? tLines.length * tLineH + tPadY * 2 : 0;

  ctx.font = `900 ${mFS}px ${FONT}`;
  const mLines = wrapText(ctx, main || teaser, w - padX * 2);
  const mLineH = mFS * 1.15;
  const mPadY  = Math.round(mFS * 0.48);
  const mBoxH  = mLines.length * mLineH + mPadY * 2;

  // ─ Position: boxes sit just above the strip ─────────────────────────────────
  const totalBoxH = tBoxH + mBoxH;
  const boxY      = h - stripH - totalBoxH;

  // ─ Teaser box (dark) ────────────────────────────────────────────────────────
  if (tLines.length) {
    drawBox(ctx, teaser, 0, boxY, {
      bgColor:    "rgba(10,10,10,0.88)",
      textColor:  "#ffffff",
      fontSize:   tFS,
      fontWeight: "700",
      padX,
      padY:  tPadY,
      maxW:  w,
      lineHeightMult: 1.3,
    });
  }

  // ─ Main message box (brand primary) ─────────────────────────────────────────
  const mainY = boxY + tBoxH;
  ctx.font = `900 ${mFS}px ${FONT}`;
  const mainLines2 = wrapText(ctx, main || teaser, w - padX * 2);
  const mBoxActualH = mainLines2.length * mLineH + mPadY * 2;
  ctx.fillStyle = primary;
  ctx.fillRect(0, mainY, w, mBoxActualH);
  ctx.fillStyle = contrastColor(primary);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
  mainLines2.forEach((line, i) =>
    ctx.fillText(line, padX, mainY + mPadY + i * mLineH, w - padX * 2)
  );

  // ─ Bottom strip (brand secondary) ───────────────────────────────────────────
  const stripY = h - stripH;
  const { r: sr, g: sg, b: sb } = hexToRgb(secondary);
  ctx.fillStyle = `rgba(${sr},${sg},${sb},0.96)`;
  ctx.fillRect(0, stripY, w, stripH);

  const stripText = client.instagram_handle
    ? `@${client.instagram_handle.replace(/^@/, "")}`
    : client.name;
  const stripFS = Math.round(stripH * 0.34);
  ctx.font         = `700 ${stripFS}px ${FONT}`;
  ctx.fillStyle    = contrastColor(secondary);
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.fillText(stripText, padX, stripY + stripH / 2);

  if (showLogo && logo && logo.naturalWidth > 0) {
    const lH = Math.round(stripH * 0.65);
    const lW = lH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, w - padX - lW, stripY + (stripH - lH) / 2, lW, lH);
  }
}

function drawBold(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  showLogo: boolean
) {
  const primary = client.primary_color;
  const padX    = Math.round(w * 0.07);
  const fontSize = Math.round(w * 0.11);
  const lineH    = fontSize * 1.1;
  const padY     = Math.round(fontSize * 0.55);

  // Measure text
  ctx.font = `900 ${fontSize}px ${FONT}`;
  const text  = post.visual_headline || post.headline;
  const lines = wrapText(ctx, text, w - padX * 2);
  const boxH  = lines.length * lineH + padY * 2;

  // Place banner at bottom 1/3
  const bannerY = h - boxH - Math.round(h * 0.05);

  // Semi-transparent primary band spanning full width
  const { r, g, b } = hexToRgb(primary);
  ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
  ctx.fillRect(0, bannerY, w, boxH);

  // Accent top-border line
  ctx.fillStyle = contrastColor(primary) === "#ffffff"
    ? "rgba(255,255,255,0.4)"
    : "rgba(0,0,0,0.3)";
  ctx.fillRect(0, bannerY, w, 6);

  // Text
  ctx.font         = `900 ${fontSize}px ${FONT}`;
  ctx.fillStyle    = contrastColor(primary);
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";
  ctx.shadowBlur   = 0;
  lines.forEach((line, i) => ctx.fillText(line, padX, bannerY + padY + i * lineH, w - padX * 2));

  if (showLogo && logo && logo.naturalWidth > 0) drawLogoBottomLeft(ctx, logo, w, h);
}

function drawLogoBottomLeft(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  w: number, h: number
) {
  const pad   = Math.round(w * 0.07);
  const lH    = Math.round(h * 0.065);
  const lW    = lH * (logo.naturalWidth / logo.naturalHeight);
  ctx.drawImage(logo, pad, h - pad - lH, lW, lH);
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  post:   GeneratedPost;
  client: BrandProfile;
}

export function PostComposer({ post, client }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered,       setRendered]       = useState(false);
  const [template,       setTemplate]       = useState<Template>("cards");
  const [overlayOpacity, setOverlayOpacity] = useState(20);
  const [showHook,       setShowHook]       = useState(true);
  const [showLogo,       setShowLogo]       = useState(!!client.logo_url);

  const dim = FORMAT_PX[post.format] ?? FORMAT_PX.feed;

  // ─ Load Montserrat font via Google Fonts CSS ─────────────────────────────────
  useEffect(() => {
    const LINK_ID = "post-composer-gfonts";
    if (!document.getElementById(LINK_ID)) {
      const link  = document.createElement("link");
      link.id     = LINK_ID;
      link.rel    = "stylesheet";
      link.href   = "https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&display=swap";
      document.head.appendChild(link);
    }
  }, []);

  const proxyUrl = (src: string) => `/api/proxy/image?url=${encodeURIComponent(src)}`;

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !post.image_url) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = dim.w;
    canvas.height = dim.h;

    // Wait for fonts
    try { await document.fonts.load(`900 16px Montserrat`); } catch { /* fallback */ }

    // ── Background image ────────────────────────────────────────────────────────
    const img = await loadImage(proxyUrl(post.image_url!));
    if (!img) return;
    const { sx, sy, sw, sh } = coverFit(img, dim.w, dim.h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dim.w, dim.h);

    // ── Logo ────────────────────────────────────────────────────────────────────
    const logo = (showLogo && client.logo_url)
      ? await loadImage(proxyUrl(client.logo_url))
      : null;

    // ── Template render ─────────────────────────────────────────────────────────
    ctx.shadowBlur  = 0;
    ctx.shadowColor = "transparent";

    switch (template) {
      case "gradient":
        drawGradient(ctx, dim.w, dim.h, post, client, logo, overlayOpacity, showHook, showLogo);
        break;
      case "cards":
        drawCards(ctx, dim.w, dim.h, post, client, logo, showLogo);
        break;
      case "bold":
        drawBold(ctx, dim.w, dim.h, post, client, logo, showLogo);
        break;
    }

    setRendered(true);
  }, [post, client, dim, template, overlayOpacity, showHook, showLogo]); // eslint-disable-line

  useEffect(() => {
    if (post.image_url) { setRendered(false); draw(); }
  }, [draw, post.image_url]);

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link      = document.createElement("a");
    link.download   = `${client.name.toLowerCase().replace(/\s+/g, "-")}-${post.format}.png`;
    link.href       = canvas.toDataURL("image/png");
    link.click();
  }

  if (!post.image_url) return null;

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-700">Arte Final</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => { setRendered(false); draw(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={!rendered}
            className="bg-violet-600 hover:bg-violet-700 text-white">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download PNG
          </Button>
        </div>
      </div>

      {/* ── Template selector ── */}
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATES.map(t => (
          <button key={t.id} type="button"
            onClick={() => setTemplate(t.id)}
            className={`py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${
              template === t.id
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"
            }`}>
            <span className="mr-1.5">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-600 bg-slate-50 rounded-xl p-3">
        {template === "gradient" && (
          <>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showHook} onChange={e => setShowHook(e.target.checked)} className="accent-violet-600" />
              Mostrar headline
            </label>
            <label className="flex items-center gap-2">
              Overlay:
              <input type="range" min={0} max={70} value={overlayOpacity}
                onChange={e => setOverlayOpacity(Number(e.target.value))}
                className="w-20 accent-violet-600" />
              <span>{overlayOpacity}%</span>
            </label>
          </>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showLogo && !!client.logo_url} disabled={!client.logo_url}
            onChange={e => setShowLogo(e.target.checked)} className="accent-violet-600" />
          {client.logo_url ? "Mostrar logo" : "Logo (carregue no perfil)"}
        </label>
      </div>

      {/* ── Canvas preview ── */}
      <div className="w-full rounded-xl overflow-hidden border shadow-sm bg-slate-100"
        style={{ aspectRatio: `${dim.w}/${dim.h}` }}>
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
      </div>
    </div>
  );
}
