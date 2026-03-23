"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Download, RefreshCw, ScanSearch, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandProfile, GeneratedPost } from "@/types";

type CompositionZone = "left" | "right" | "bottom" | "top" | "center";

const FORMAT_PX: Record<string, { w: number; h: number }> = {
  feed:        { w: 1080, h: 1350 },
  stories:     { w: 1080, h: 1920 },
  reels_cover: { w: 1080, h: 1920 },
};

type Template = "gradient" | "cards" | "glass" | "bold";

const TEMPLATES: { id: Template; label: string; icon: string }[] = [
  { id: "gradient", label: "Gradiente", icon: "🌅" },
  { id: "cards",    label: "Cards",     icon: "🎨" },
  { id: "glass",    label: "Glass",     icon: "🔮" },
  { id: "bold",     label: "Negrito",   icon: "⚡" },
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
function hexAlpha(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
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

/** Splits visual_headline into [teaser, main] for the Cards/Glass templates */
function splitHeadline(text: string): [string, string] {
  const m = text.match(/^([^.!?]+[.!?])\s*([\s\S]+)$/);
  if (m && m[2].trim().length > 2) return [m[1].trim(), m[2].trim()];
  const lines = text.split(/\n/);
  if (lines.length >= 2) return [lines[0].trim(), lines.slice(1).join(" ").trim()];
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
    shadow?: { color: string; blur: number; offsetX?: number; offsetY?: number };
  }
): number {
  const { bgColor, textColor, fontSize, fontWeight, padX, padY, maxW, lineHeightMult = 1.2, shadow } = opts;
  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
  const lines = wrapText(ctx, text, maxW - padX * 2);
  const lh    = fontSize * lineHeightMult;
  const boxH  = lines.length * lh + padY * 2;

  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, maxW, boxH);

  if (shadow) {
    ctx.shadowColor   = shadow.color;
    ctx.shadowBlur    = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX ?? 0;
    ctx.shadowOffsetY = shadow.offsetY ?? 2;
  } else {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur  = 0;
  }

  ctx.fillStyle    = textColor;
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";
  lines.forEach((line, i) => ctx.fillText(line, x + padX, y + padY + i * lh, maxW - padX * 2));

  ctx.shadowColor   = "transparent";
  ctx.shadowBlur    = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  return boxH;
}

/**
 * Glassmorphism panel — simulates frosted glass on canvas:
 * 1. Clips to panel rect, redraws background image blurred
 * 2. Applies white/tinted overlay
 * 3. Top-edge highlight gradient
 * 4. Hairline border
 */
function drawGlassPanel(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number, sy: number, sw: number, sh: number,  // original coverFit params
  cw: number, ch: number,                           // canvas dimensions
  px: number, py: number, pw: number, ph: number,  // panel position/size
  tintColor: string,
  tintAlpha: number
) {
  ctx.save();

  // Clip to panel
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  // Blurred background (re-draw image with filter)
  ctx.filter = "blur(20px)";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  ctx.filter = "none";

  // Tinted overlay
  ctx.fillStyle = hexAlpha(tintColor, tintAlpha);
  ctx.fillRect(px, py, pw, ph);

  // Top highlight gradient (glass shine)
  const shine = ctx.createLinearGradient(px, py, px, py + ph * 0.35);
  shine.addColorStop(0,   "rgba(255,255,255,0.28)");
  shine.addColorStop(0.5, "rgba(255,255,255,0.08)");
  shine.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(px, py, pw, ph);

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.40)";
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(px + 0.75, py + 0.75, pw - 1.5, ph - 1.5);

  ctx.restore();
}

/** Load image, returns null on failure */
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img      = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src     = src;
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
  if (overlayOpacity > 0) {
    ctx.fillStyle = hexAlpha(client.primary_color, overlayOpacity / 100);
    ctx.fillRect(0, 0, w, h);
  }

  if (!showHook) {
    if (showLogo && logo) drawLogoBottomLeft(ctx, logo, w, h);
    return;
  }

  const grad = ctx.createLinearGradient(0, h * 0.45, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const pad      = Math.round(w * 0.07);
  const fontSize = Math.round(w * 0.076);
  const maxWidth = w - pad * 2;
  const lineH    = fontSize * 1.25;
  const logoH    = showLogo && logo ? Math.round(h * 0.065) : 0;
  const logoGap  = logoH ? Math.round(pad * 0.6) : 0;

  ctx.font      = `800 ${fontSize}px ${FONT}`;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "bottom";

  // Brand-tinted drop shadow
  ctx.shadowColor   = hexAlpha(client.primary_color, 0.7);
  ctx.shadowBlur    = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  const text  = post.visual_headline || post.headline;
  const lines = wrapText(ctx, text, maxWidth);
  let y = h - pad - logoH - logoGap;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], pad, y, maxWidth);
    y -= lineH;
  }
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  if (showLogo && logo) drawLogoBottomLeft(ctx, logo, w, h);
}

function drawCards(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  showLogo: boolean,
  zone: CompositionZone
) {
  const primary   = client.primary_color;
  const secondary = client.secondary_color;
  const pad       = Math.round(w * 0.07);
  const stripH    = Math.round(h * 0.105);

  // Dark veil
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, w, h);

  const [teaser, main] = splitHeadline(post.visual_headline || post.headline);

  const isSide   = zone === "left" || zone === "right";
  const isTop    = zone === "top";

  // Side positioning: boxes cover 58% of width
  const boxMaxW  = isSide ? Math.round(w * 0.60) : w;
  const boxAncX  = zone === "right" ? Math.round(w * 0.40) : 0;

  // Font sizes scale down a bit for side panels
  const scaleFactor = isSide ? 0.88 : 1;
  const tFS = Math.round(w * 0.054 * scaleFactor);
  const mFS = Math.round(w * 0.086 * scaleFactor);

  ctx.font = `700 ${tFS}px ${FONT}`;
  const tLines = teaser ? wrapText(ctx, teaser, boxMaxW - pad * 2) : [];
  const tLineH = tFS * 1.3;
  const tPadY  = Math.round(tFS * 0.55);
  const tBoxH  = tLines.length ? tLines.length * tLineH + tPadY * 2 : 0;

  ctx.font = `900 ${mFS}px ${FONT}`;
  const mLines = wrapText(ctx, main || teaser, boxMaxW - pad * 2);
  const mLineH = mFS * 1.15;
  const mPadY  = Math.round(mFS * 0.48);
  const mBoxH  = mLines.length * mLineH + mPadY * 2;

  const totalBoxH = tBoxH + mBoxH;

  let boxY: number;
  if (isTop) {
    boxY = 0;
  } else if (isSide) {
    boxY = Math.round((h - stripH - totalBoxH) / 2); // vertically centred (minus strip)
  } else {
    boxY = h - stripH - totalBoxH;
  }

  // Teaser box (dark)
  if (tLines.length) {
    ctx.fillStyle = "rgba(10,10,10,0.88)";
    ctx.fillRect(boxAncX, boxY, boxMaxW, tBoxH);
    ctx.fillStyle    = "#ffffff";
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.shadowColor  = "transparent"; ctx.shadowBlur = 0;
    tLines.forEach((line, i) =>
      ctx.fillText(line, boxAncX + pad, boxY + tPadY + i * tLineH, boxMaxW - pad * 2)
    );
  }

  // Main box (brand primary)
  const mainY = boxY + tBoxH;
  ctx.fillStyle = primary;
  ctx.fillRect(boxAncX, mainY, boxMaxW, mBoxH);

  // Brand-tinted text shadow on main text
  ctx.shadowColor   = "rgba(0,0,0,0.45)";
  ctx.shadowBlur    = 6;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle    = contrastColor(primary);
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";
  mLines.forEach((line, i) =>
    ctx.fillText(line, boxAncX + pad, mainY + mPadY + i * mLineH, boxMaxW - pad * 2)
  );
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;

  // Bottom strip (brand secondary) — always full width
  const stripY = h - stripH;
  ctx.fillStyle = hexAlpha(secondary, 0.96);
  ctx.fillRect(0, stripY, w, stripH);

  const stripText = client.instagram_handle
    ? `@${client.instagram_handle.replace(/^@/, "")}`
    : client.name;
  const stripFS = Math.round(stripH * 0.34);
  ctx.font         = `700 ${stripFS}px ${FONT}`;
  ctx.fillStyle    = contrastColor(secondary);
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.fillText(stripText, pad, stripY + stripH / 2);

  if (showLogo && logo && logo.naturalWidth > 0) {
    const lH = Math.round(stripH * 0.65);
    const lW = lH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, w - pad - lW, stripY + (stripH - lH) / 2, lW, lH);
  }
}

function drawGlass(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number, sy: number, sw: number, sh: number,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  showLogo: boolean,
  zone: CompositionZone
) {
  const primary   = client.primary_color;
  const secondary = client.secondary_color;
  const pad       = Math.round(w * 0.07);
  const stripH    = Math.round(h * 0.10);

  const [teaser, main] = splitHeadline(post.visual_headline || post.headline);

  const isSide = zone === "left" || zone === "right";
  const isTop  = zone === "top";

  // Panel dimensions
  const panelW = isSide ? Math.round(w * 0.62) : w;
  const panelX = zone === "right" ? w - panelW : 0;

  // Measure text
  const tFS = Math.round(w * (isSide ? 0.048 : 0.052));
  const mFS = Math.round(w * (isSide ? 0.078 : 0.082));

  ctx.font = `700 ${tFS}px ${FONT}`;
  const tLines = teaser ? wrapText(ctx, teaser, panelW - pad * 2) : [];
  const tLineH = tFS * 1.3;
  const tPadY  = Math.round(tFS * 0.6);
  const tPanelH = tLines.length ? tLines.length * tLineH + tPadY * 2 : 0;

  ctx.font = `900 ${mFS}px ${FONT}`;
  const mLines  = wrapText(ctx, main || teaser, panelW - pad * 2);
  const mLineH  = mFS * 1.15;
  const mPadY   = Math.round(mFS * 0.5);
  const mPanelH = mLines.length * mLineH + mPadY * 2;

  const totalH  = tPanelH + mPanelH + stripH;

  let panelTopY: number;
  if (isTop) {
    panelTopY = 0;
  } else if (isSide) {
    panelTopY = Math.round((h - totalH) / 2);
  } else {
    panelTopY = h - totalH;
  }

  // ── Teaser glass panel ────────────────────────────────────────────────────────
  if (tLines.length) {
    drawGlassPanel(
      ctx, img, sx, sy, sw, sh, w, h,
      panelX, panelTopY, panelW, tPanelH,
      "#000000", 0.30
    );
    ctx.font         = `700 ${tFS}px ${FONT}`;
    ctx.fillStyle    = "rgba(255,255,255,0.90)";
    ctx.textBaseline = "top";
    ctx.textAlign    = "left";
    ctx.shadowColor  = "rgba(0,0,0,0.6)";
    ctx.shadowBlur   = 8;
    tLines.forEach((line, i) =>
      ctx.fillText(line, panelX + pad, panelTopY + tPadY + i * tLineH, panelW - pad * 2)
    );
    ctx.shadowBlur = 0; ctx.shadowColor = "transparent";
  }

  // ── Main glass panel (tinted with brand primary) ──────────────────────────────
  const mainPanelY = panelTopY + tPanelH;
  drawGlassPanel(
    ctx, img, sx, sy, sw, sh, w, h,
    panelX, mainPanelY, panelW, mPanelH,
    primary, 0.55
  );

  // Main text with brand-color glow
  ctx.font         = `900 ${mFS}px ${FONT}`;
  ctx.fillStyle    = contrastColor(primary);
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";
  ctx.shadowColor  = hexAlpha(primary, 0.6);
  ctx.shadowBlur   = 12;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 3;
  mLines.forEach((line, i) =>
    ctx.fillText(line, panelX + pad, mainPanelY + mPadY + i * mLineH, panelW - pad * 2)
  );
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // ── Bottom strip glass ────────────────────────────────────────────────────────
  const stripY = h - stripH;
  drawGlassPanel(
    ctx, img, sx, sy, sw, sh, w, h,
    0, stripY, w, stripH,
    secondary, 0.75
  );

  const stripText = client.instagram_handle
    ? `@${client.instagram_handle.replace(/^@/, "")}`
    : client.name;
  const stripFS = Math.round(stripH * 0.34);
  ctx.font         = `700 ${stripFS}px ${FONT}`;
  ctx.fillStyle    = contrastColor(secondary);
  ctx.textBaseline = "middle";
  ctx.textAlign    = "left";
  ctx.shadowColor  = "rgba(0,0,0,0.4)";
  ctx.shadowBlur   = 6;
  ctx.fillText(stripText, pad, stripY + stripH / 2);
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent";

  if (showLogo && logo && logo.naturalWidth > 0) {
    const lH = Math.round(stripH * 0.65);
    const lW = lH * (logo.naturalWidth / logo.naturalHeight);
    ctx.drawImage(logo, w - pad - lW, stripY + (stripH - lH) / 2, lW, lH);
  }
}

function drawBold(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  post: GeneratedPost, client: BrandProfile,
  logo: HTMLImageElement | null,
  showLogo: boolean
) {
  const primary  = client.primary_color;
  const pad      = Math.round(w * 0.07);
  const fontSize = Math.round(w * 0.11);
  const lineH    = fontSize * 1.1;
  const padY     = Math.round(fontSize * 0.55);

  ctx.font = `900 ${fontSize}px ${FONT}`;
  const text  = post.visual_headline || post.headline;
  const lines = wrapText(ctx, text, w - pad * 2);
  const boxH  = lines.length * lineH + padY * 2;
  const bannerY = h - boxH - Math.round(h * 0.05);

  // Semi-transparent primary band
  ctx.fillStyle = hexAlpha(primary, 0.92);
  ctx.fillRect(0, bannerY, w, boxH);

  // Accent top-border line
  ctx.fillStyle = contrastColor(primary) === "#ffffff"
    ? "rgba(255,255,255,0.45)"
    : "rgba(0,0,0,0.30)";
  ctx.fillRect(0, bannerY, w, 5);

  // Text with brand-glow shadow
  ctx.font         = `900 ${fontSize}px ${FONT}`;
  ctx.fillStyle    = contrastColor(primary);
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";
  ctx.shadowColor  = "rgba(0,0,0,0.50)";
  ctx.shadowBlur   = 8;
  ctx.shadowOffsetY = 3;
  lines.forEach((line, i) => ctx.fillText(line, pad, bannerY + padY + i * lineH, w - pad * 2));
  ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; ctx.shadowOffsetY = 0;

  if (showLogo && logo && logo.naturalWidth > 0) drawLogoBottomLeft(ctx, logo, w, h);
}

function drawLogoBottomLeft(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  w: number, h: number
) {
  const pad = Math.round(w * 0.07);
  const lH  = Math.round(h * 0.065);
  const lW  = lH * (logo.naturalWidth / logo.naturalHeight);
  ctx.drawImage(logo, pad, h - pad - lH, lW, lH);
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface Props {
  post:             GeneratedPost;
  client:           BrandProfile;
  onImageRefined?:  (imageUrl: string) => void;
}

export function PostComposer({ post, client, onImageRefined }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered,       setRendered]       = useState(false);
  const [template,       setTemplate]       = useState<Template>("cards");
  const [overlayOpacity, setOverlayOpacity] = useState(20);
  const [showHook,       setShowHook]       = useState(true);
  const [showLogo,       setShowLogo]       = useState(!!client.logo_url);
  const [zone,           setZone]           = useState<CompositionZone>(
    (post.composition_zone as CompositionZone) ?? "bottom"
  );
  const [analyzing,   setAnalyzing]   = useState(false);
  const [analyzeInfo, setAnalyzeInfo] = useState<string>("");
  const [refining,    setRefining]    = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  const dim = FORMAT_PX[post.format] ?? FORMAT_PX.feed;

  // ─ Load Montserrat font ───────────────────────────────────────────────────────
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

    try { await document.fonts.load(`900 16px Montserrat`); } catch { /* fallback */ }

    // Background image
    const img = await loadImage(proxyUrl(post.image_url!));
    if (!img) return;
    const { sx, sy, sw, sh } = coverFit(img, dim.w, dim.h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dim.w, dim.h);

    // Logo
    const logo = (showLogo && client.logo_url)
      ? await loadImage(proxyUrl(client.logo_url))
      : null;

    ctx.shadowBlur  = 0;
    ctx.shadowColor = "transparent";

    switch (template) {
      case "gradient":
        drawGradient(ctx, dim.w, dim.h, post, client, logo, overlayOpacity, showHook, showLogo);
        break;
      case "cards":
        drawCards(ctx, dim.w, dim.h, post, client, logo, showLogo, zone);
        break;
      case "glass":
        drawGlass(ctx, img, sx, sy, sw, sh, dim.w, dim.h, post, client, logo, showLogo, zone);
        break;
      case "bold":
        drawBold(ctx, dim.w, dim.h, post, client, logo, showLogo);
        break;
    }

    setRendered(true);
  }, [post, client, dim, template, overlayOpacity, showHook, showLogo, zone]); // eslint-disable-line

  useEffect(() => {
    if (post.image_url) { setRendered(false); draw(); }
  }, [draw, post.image_url]);

  // ─ Analyze composition ────────────────────────────────────────────────────────
  async function handleAnalyze() {
    if (!post.image_url || analyzing) return;
    setAnalyzing(true);
    setAnalyzeInfo("");
    try {
      const res = await fetch("/api/posts/analyze-composition", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image_url: post.image_url }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setZone(data.zone ?? "bottom");
      setAnalyzeInfo(`${data.subject_description} → texto posicionado em: ${data.zone}`);
    } catch (e) {
      setAnalyzeInfo("Erro na análise. Usando posição padrão.");
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  }

  // ─ Refine with Freepik img2img ───────────────────────────────────────────────
  async function handleFreepikRefine() {
    const canvas = canvasRef.current;
    if (!canvas || refining) return;

    setRefining(true);
    setRefineError(null);

    try {
      // Export canvas as JPEG base64 (smaller than PNG)
      const dataUrl     = canvas.toDataURL("image/jpeg", 0.88);
      const canvas_base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");

      // 1. Submit to Freepik
      const res  = await fetch("/api/posts/refine-image", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ post_id: post.id, canvas_base64 }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRefineError(data.error ?? "Erro ao iniciar refinamento");
        return;
      }

      const { task_id, post_id } = data as { task_id: string; post_id: string };

      // 2. Poll check-image every 4s for up to 90s
      for (let i = 0; i < 23; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const check = await fetch(`/api/posts/check-image?task_id=${task_id}&post_id=${post_id}`);
        const checkData = await check.json() as { status: string; image_url?: string; error?: string };

        if (checkData.status === "COMPLETED" && checkData.image_url) {
          onImageRefined?.(checkData.image_url);
          setRefining(false);
          return;
        }
        if (checkData.status === "FAILED") {
          setRefineError(checkData.error ?? "Falha no refinamento");
          setRefining(false);
          return;
        }
      }
      setRefineError("Timeout. A Freepik demorou mais que o esperado. Tente novamente.");
    } catch (e) {
      console.error(e);
      setRefineError("Erro inesperado. Tente novamente.");
    } finally {
      setRefining(false);
    }
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link    = document.createElement("a");
    link.download = `${client.name.toLowerCase().replace(/\s+/g, "-")}-${post.format}.png`;
    link.href     = canvas.toDataURL("image/png");
    link.click();
  }

  if (!post.image_url) return null;

  const supportsZone = template === "cards" || template === "glass";

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
            <Download className="w-3.5 h-3.5 mr-1.5" /> PNG
          </Button>
        </div>
      </div>

      {/* ── Freepik img2img refine ── */}
      <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-violet-50 to-fuchsia-50 rounded-xl border border-violet-100">
        <div className="flex-1">
          <p className="text-xs font-semibold text-violet-800">Refinar com Freepik ✨</p>
          <p className="text-xs text-violet-500 mt-0.5">
            Envia a arte composta para o Freepik melhorar a qualidade fotográfica preservando o layout
          </p>
          {refineError && <p className="text-xs text-red-500 mt-1">{refineError}</p>}
        </div>
        <Button
          size="sm"
          onClick={handleFreepikRefine}
          disabled={refining || !rendered}
          className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white"
        >
          {refining
            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Refinando...</>
            : <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Refinar</>}
        </Button>
      </div>

      {/* ── Template selector ── */}
      <div className="grid grid-cols-4 gap-2">
        {TEMPLATES.map(t => (
          <button key={t.id} type="button"
            onClick={() => setTemplate(t.id)}
            className={`py-2 px-2 rounded-xl border-2 text-xs font-semibold transition-all ${
              template === t.id
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"
            }`}>
            <span className="mr-1">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="space-y-2">
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

        {/* ── Composition zone ── */}
        {supportsZone && (
          <div className="flex items-start gap-2 bg-violet-50 rounded-xl p-3 border border-violet-100">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-violet-700">Posição do texto</span>
                <Button size="sm" variant="outline"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="h-6 px-2 text-xs border-violet-300 text-violet-700 hover:bg-violet-100">
                  {analyzing
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : <ScanSearch className="w-3 h-3 mr-1" />}
                  {analyzing ? "Analisando..." : "Analisar IA 🔍"}
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(["top","left","bottom","right","center"] as CompositionZone[]).map(z => (
                  <button key={z} type="button"
                    onClick={() => setZone(z)}
                    className={`py-1 text-xs rounded-lg border font-medium transition-all capitalize ${
                      zone === z
                        ? "border-violet-500 bg-violet-600 text-white"
                        : "border-slate-200 text-slate-500 hover:border-violet-300 bg-white"
                    }`}>
                    {z === "top" ? "↑" : z === "bottom" ? "↓" : z === "left" ? "←" : z === "right" ? "→" : "·"}
                    {" "}{z}
                  </button>
                ))}
              </div>
              {analyzeInfo && (
                <p className="text-xs text-violet-600 italic leading-tight">{analyzeInfo}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Layout prompt (for img2img) ── */}
      {post.layout_prompt && (
        <details className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3 border border-slate-100">
          <summary className="cursor-pointer font-medium text-slate-600 select-none">
            🎯 Layout prompt (img2img)
          </summary>
          <p className="mt-2 leading-relaxed text-slate-500 italic">{post.layout_prompt}</p>
        </details>
      )}

      {/* ── Canvas preview ── */}
      <div className="w-full rounded-xl overflow-hidden border shadow-sm bg-slate-100"
        style={{ aspectRatio: `${dim.w}/${dim.h}` }}>
        <canvas ref={canvasRef} className="w-full h-full" style={{ display: "block" }} />
      </div>
    </div>
  );
}
