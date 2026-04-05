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
  imageUrl:         string;           // URL da imagem gerada pela IA
  logoUrl?:         string | null;    // URL do logo do cliente (Firebase Storage)
  visualHeadline:   string;           // Máx 6 palavras — headline em cima da foto
  instagramHandle?: string | null;    // @handle do cliente
  clientName:       string;           // Nome do cliente (bottom strip)
  primaryColor:     string;           // Hex da cor primária da marca
  secondaryColor:   string;           // Hex da cor secundária
  format:           "feed" | "stories" | "reels_cover";
  postId:           string;
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

function buildOverlayElement(
  opts: ComposeOptions,
  W: number,
  H: number
): React.ReactElement {
  const primary   = ensureHex(opts.primaryColor);
  const secondary = ensureHex(opts.secondaryColor);

  const STRIP_H   = 110;
  const [line1, line2] = splitHeadline(opts.visualHeadline);
  const hasTwoLines    = !!line2;

  // Tamanho da fonte: maior se headline for curta (1 linha)
  const fontSize  = hasTwoLines ? 86 : 108;
  const lineH     = fontSize * 1.05;

  // Posição bottom da headline (acima do strip + padding)
  const headlineBottom = STRIP_H + 48 + (hasTwoLines ? lineH * 2.1 : lineH * 1.1);

  const handle = opts.instagramHandle ? sanitizeHandle(opts.instagramHandle) : "";

  return (
    <div
      style={{
        width:    W,
        height:   H,
        display:  "flex",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Gradiente inferior (transparent → primary) ───────────────── */}
      <div
        style={{
          position:   "absolute",
          bottom:     STRIP_H,
          left:       0,
          right:      0,
          height:     Math.round(H * 0.58),
          background: `linear-gradient(to bottom, ${hexToRgba(primary, 0)} 0%, ${hexToRgba(primary, 0.62)} 55%, ${hexToRgba(primary, 0.93)} 100%)`,
          display:    "flex",
        }}
      />

      {/* ── Faixa inferior (cor primária sólida) ─────────────────────── */}
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
        {/* Nome do cliente */}
        <span
          style={{
            color:       "white",
            fontSize:    28,
            fontFamily:  "Inter",
            fontWeight:  700,
            letterSpacing: 1,
          }}
        >
          {opts.clientName.toUpperCase()}
        </span>

        {/* Handle @instagram */}
        {handle && (
          <span
            style={{
              color:       secondary,
              fontSize:    28,
              fontFamily:  "Inter",
              fontWeight:  700,
              letterSpacing: 0.5,
            }}
          >
            @{handle}
          </span>
        )}
      </div>

      {/* ── Headline ─────────────────────────────────────────────────── */}
      <div
        style={{
          position:      "absolute",
          bottom:        headlineBottom,
          left:          50,
          right:         50,
          display:       "flex",
          flexDirection: "column",
        }}
      >
        {/* Linha 1 — branca */}
        <span
          style={{
            fontSize,
            fontWeight:    900,
            fontFamily:    "Montserrat",
            color:         "white",
            lineHeight:    1.0,
            letterSpacing: -2,
          }}
        >
          {line1}
        </span>

        {/* Linha 2 — cor secundária */}
        {hasTwoLines && (
          <span
            style={{
              fontSize,
              fontWeight:    900,
              fontFamily:    "Montserrat",
              color:         secondary,
              lineHeight:    1.05,
              letterSpacing: -2,
            }}
          >
            {line2}
          </span>
        )}
      </div>

      {/* ── Placeholder do logo (canto superior — espaço reservado) ──── */}
      {/* O logo real é adicionado via sharp composite depois do satori  */}
      {/* Mas adicionamos um badge com cor primária como fundo do logo   */}
      <div
        style={{
          position:        "absolute",
          top:             40,
          left:            40,
          height:          80,
          minWidth:        40,
          backgroundColor: hexToRgba(primary, 0.65),
          borderRadius:    14,
          display:         "flex",
          alignItems:      "center",
          padding:         "8px 16px",
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
        // Redimensionar logo: máx 200×80px mantendo proporção
        const logoResized = await sharp(logoBuffer)
          .resize(200, 80, { fit: "inside", withoutEnlargement: true })
          .toBuffer();
        // Posição: top 48px, left 56px (dentro do badge cinza do satori)
        layers.push({ input: logoResized, top: 48, left: 56 });
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
