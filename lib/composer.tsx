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

// ── Types ────────────────────────────────────────────────────────────────────

export interface ComposeOptions {
  imageUrl:             string;           // URL da imagem gerada pela IA
  logoUrl?:             string | null;    // URL do logo do cliente (Firebase Storage)
  visualHeadline:       string;           // Máx 6 palavras — headline em cima da foto
  instagramHandle?:     string | null;    // @handle do cliente
  clientName:           string;           // Nome do cliente (bottom strip)
  primaryColor:         string;           // Hex da cor primária da marca
  secondaryColor:       string;           // Hex da cor secundária
  format:               "feed" | "stories" | "reels_cover";
  postId:               string;
  // Opcionais — derivados do ReferenceDNA quando presente
  compositionZone?:     "left" | "right" | "bottom" | "top" | "center";
  backgroundTreatment?: string;           // texto livre do reference_dna.background_treatment
}

// ── Font cache (persiste entre invocações warm no Lambda) ────────────────────

interface FontCache {
  montserrat900:    ArrayBuffer;
  montserrat900Ext: ArrayBuffer | null;
  inter700:         ArrayBuffer;
  inter700Ext:      ArrayBuffer | null;
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
  const [m900, i700] = await Promise.all([
    fetchSafe("https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/montserrat/static/Montserrat-Black.ttf"),
    fetchSafe("https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.ttf"),
  ]);

  // Fallback: fontsource WOFF (não WOFF2) — suportado pelo satori
  const [m900Fallback, i700Fallback] = await Promise.all([
    m900 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/montserrat@4/files/montserrat-latin-900-normal.woff"),
    i700 ? Promise.resolve(null) : fetchSafe("https://cdn.jsdelivr.net/npm/@fontsource/inter@4/files/inter-latin-700-normal.woff"),
  ]);

  const montserrat = m900 ?? m900Fallback;
  const inter      = i700 ?? i700Fallback;

  if (!montserrat) throw new Error("[composer] Falha ao carregar fonte Montserrat 900");
  if (!inter)      throw new Error("[composer] Falha ao carregar fonte Inter 700");

  // Renomeia para manter compatibilidade com o restante da função
  const m900Final = montserrat;
  const i700Final = inter;

  _fontCache = {
    montserrat900:    m900Final,
    montserrat900Ext: null,   // TTF já inclui todos os caracteres incluindo latin-ext
    inter700:         i700Final,
    inter700Ext:      null,
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
 * Divide a headline em 2 linhas balanceadas.
 * Palavras ≤ 3 → 1 linha; mais → divide ao meio.
 */
function splitHeadline(text: string): [string, string] {
  const words = text.toUpperCase().trim().split(/\s+/);
  if (words.length <= 3) return [words.join(" "), ""];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
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

function buildOverlayElement(
  opts: ComposeOptions,
  W: number,
  H: number
): React.ReactElement {
  const primary   = ensureHex(opts.primaryColor);
  const secondary = ensureHex(opts.secondaryColor);
  const zone      = opts.compositionZone ?? "bottom";
  const handle    = opts.instagramHandle ? sanitizeHandle(opts.instagramHandle) : "";

  const [line1, line2] = splitHeadline(opts.visualHeadline);
  const hasTwoLines    = !!line2;
  const fontSize       = hasTwoLines ? 86 : 108;
  const lineH          = fontSize * 1.05;
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

        {/* ── Headline ──────────────────────────────────────────────────── */}
        <div style={textStyle}>
          <span style={{ fontSize, fontWeight: 900, fontFamily: "Montserrat", color: "white", lineHeight: 1.0, letterSpacing: -2 }}>
            {line1}
          </span>
          {hasTwoLines && (
            <span style={{ fontSize, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -2 }}>
              {line2}
            </span>
          )}
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

        {/* ── Badge sutil para o logo ───────────────────────────────────── */}
        <div
          style={{
            position:        "absolute",
            top:             36,
            left:            36,
            height:          100,
            minWidth:        48,
            backgroundColor: hexToRgba(primary, 0.50),
            borderRadius:    16,
            display:         "flex",
            alignItems:      "center",
            padding:         "10px 18px",
          }}
        />
      </div>
    );
  }

  // ── MODO PADRÃO: gradiente de marca + faixa inferior ─────────────────────
  // Usado quando a referência tem overlay colorido, OU quando não há referência.
  const STRIP_H = 110;
  const maxOp   = resolveGradientOpacity(opts.backgroundTreatment);
  const c0      = hexToRgba(primary, 0);
  const c1      = hexToRgba(primary, maxOp * 0.67);
  const c2      = hexToRgba(primary, maxOp);

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

      {/* ── Headline ──────────────────────────────────────────────────── */}
      <div style={textContainerStyle}>
        <span style={{ fontSize, fontWeight: 900, fontFamily: "Montserrat", color: "white", lineHeight: 1.0, letterSpacing: -2 }}>
          {line1}
        </span>
        {hasTwoLines && (
          <span style={{ fontSize, fontWeight: 900, fontFamily: "Montserrat", color: secondary, lineHeight: 1.05, letterSpacing: -2 }}>
            {line2}
          </span>
        )}
      </div>

      {/* ── Badge de fundo para o logo ────────────────────────────────── */}
      <div
        style={{
          position:        "absolute",
          top:             36,
          left:            36,
          height:          100,
          minWidth:        48,
          backgroundColor: hexToRgba(primary, 0.72),
          borderRadius:    16,
          display:         "flex",
          alignItems:      "center",
          padding:         "10px 18px",
        }}
      />
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
    { name: "Montserrat", data: fonts.montserrat900,    weight: 900, style: "normal" },
    { name: "Inter",      data: fonts.inter700,         weight: 700, style: "normal" },
  ];
  if (fonts.montserrat900Ext) {
    satorifonts.push({ name: "Montserrat", data: fonts.montserrat900Ext, weight: 900, style: "normal" });
  }
  if (fonts.inter700Ext) {
    satorifonts.push({ name: "Inter", data: fonts.inter700Ext, weight: 700, style: "normal" });
  }

  // ── 2. Renderizar overlay com satori → SVG → PNG ───────────────────────────
  const element = buildOverlayElement(opts, W, H);

  const svg        = await satori(element, { width: W, height: H, fonts: satorifonts });
  const resvg      = new Resvg(svg, { fitTo: { mode: "width", value: W } });
  const overlayPng = resvg.render().asPng();

  // ── 3. Baixar e redimensionar imagem AI (background) ──────────────────────
  const imgResp   = await fetch(opts.imageUrl);
  if (!imgResp.ok) throw new Error(`[composer] Falha ao baixar imageUrl: ${imgResp.status}`);
  const imgBuffer = Buffer.from(await imgResp.arrayBuffer());

  const bgBuffer = await sharp(imgBuffer)
    .resize(W, H, { fit: "cover", position: "attention" }) // attention = foca no sujeito principal
    .toBuffer();

  // ── 4. Montar camadas para composite ──────────────────────────────────────
  const layers: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlayPng), top: 0, left: 0 },
  ];

  // ── 5. Logo (composite via sharp — sem limitação de tamanho no satori) ─────
  if (opts.logoUrl) {
    try {
      const logoResp = await fetch(opts.logoUrl, { signal: AbortSignal.timeout(8_000) });
      if (logoResp.ok) {
        const logoBuffer  = Buffer.from(await logoResp.arrayBuffer());
        // Redimensionar logo: máx 240×80px — sem withoutEnlargement para logos pequenos crescerem
        const logoResized = await sharp(logoBuffer)
          .resize(240, 80, { fit: "inside" })
          .toBuffer();
        // Posição: top 56px, left 54px (centralizado no badge 100px do satori)
        layers.push({ input: logoResized, top: 56, left: 54 });
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
  const key = `posts/${opts.postId}/composed.jpg`;
  return uploadToR2(key, finalBuffer, "image/jpeg");
}
