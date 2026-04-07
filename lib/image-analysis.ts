/**
 * lib/image-analysis.ts
 *
 * Análise real de pixels usando Sharp.js — substitui a estimativa do Claude
 * por dados determinísticos de visão computacional.
 *
 * O que extrai sem modelos externos (só Sharp):
 *   ✅ entropy_level         — Shannon entropy normalizada (quão poluída é a cena)
 *   ✅ brightness_zones       — luminância média por quadrante (top/bottom/left/right)
 *   ✅ subject_position       — proxy via desvio padrão de luminância por quadrante
 *   ✅ depth_of_field          — proxy via delta de sharpness entre quadrantes
 *   ✅ color_temperature       — comparação R vs B nos canais globais
 *   ✅ safe_areas              — quadrantes com menor variância = fundo limpo para texto
 *   ✅ dominant_colors         — Sharp.stats().dominant + amostras por quadrante
 *
 * Integração com Claude Vision:
 *   Quando a imagem de referência está disponível em base64, este módulo roda
 *   ANTES do Claude e produz background_analysis com dados reais de pixel.
 *   Claude então foca apenas no tone_profile (direção criativa).
 *
 * Uso:
 *   import { analyzeImage } from "@/lib/image-analysis";
 *   const bg = await analyzeImage(base64String);   // base64, Buffer ou URL
 */

import sharp from "sharp";
import type { BackgroundAnalysis } from "@/types";
import {
  detectFocalPoints,
  focalPointsToSubjectPosition,
  focalPointsToSafeAreas,
  isVisionEnabled,
  getVisionApiKey,
} from "@/lib/vision";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos internos
// ─────────────────────────────────────────────────────────────────────────────

interface QuadrantStats {
  luminance_mean: number;   // 0–255 luminância perceptual (BT.709)
  luminance_std:  number;   // desvio padrão → proxy de sharpness/detalhamento
  r_mean:         number;
  g_mean:         number;
  b_mean:         number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de pixel
// ─────────────────────────────────────────────────────────────────────────────

/** Divide buffer RGB plano em 4 quadrantes [r,g,b][] */
function splitQuadrants(
  data:   Uint8Array,
  width:  number,
  height: number,
): { tl: number[][]; tr: number[][]; bl: number[][]; br: number[][] } {
  const midX = Math.floor(width  / 2);
  const midY = Math.floor(height / 2);
  const tl: number[][] = [], tr: number[][] = [], bl: number[][] = [], br: number[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const px = [data[i], data[i + 1], data[i + 2]];
      if (y < midY) (x < midX ? tl : tr).push(px);
      else          (x < midX ? bl : br).push(px);
    }
  }
  return { tl, tr, bl, br };
}

/** Estatísticas de um quadrante (luminância BT.709 + canais RGB) */
function quadStats(pixels: number[][]): QuadrantStats {
  const n = pixels.length;
  if (n === 0) return { luminance_mean: 128, luminance_std: 0, r_mean: 128, g_mean: 128, b_mean: 128 };

  let rSum = 0, gSum = 0, bSum = 0, lumSum = 0;
  const lums: number[] = [];

  for (const [r, g, b] of pixels) {
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rSum   += r; gSum += g; bSum += b;
    lumSum += lum;
    lums.push(lum);
  }

  const mean     = lumSum / n;
  const variance = lums.reduce((s, l) => s + (l - mean) ** 2, 0) / n;

  return {
    luminance_mean: mean,
    luminance_std:  Math.sqrt(variance),
    r_mean: rSum / n,
    g_mean: gSum / n,
    b_mean: bSum / n,
  };
}

/** Luminância → classificação */
function brightness(lum: number): "light" | "dark" | "neutral" {
  return lum > 170 ? "light" : lum < 85 ? "dark" : "neutral";
}

/** RGB → hex string */
function toHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Shannon entropy (Sharp range ~0–8) → 0.0–1.0 */
function normEntropy(e: number): number {
  return Math.min(1.0, Math.max(0, e / 7.5));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — analyzeImage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analisa pixels reais da imagem e retorna BackgroundAnalysis determinístico.
 *
 * @param source  Buffer, string base64 pura (sem prefixo data:) ou URL http(s)
 */
export async function analyzeImage(source: Buffer | string): Promise<BackgroundAnalysis> {
  // ── 0. Normalizar input ────────────────────────────────────────────────────
  let buf: Buffer;

  if (Buffer.isBuffer(source)) {
    buf = source;
  } else if (source.startsWith("http")) {
    const res = await fetch(source, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`analyzeImage: fetch falhou ${res.status} — ${source}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    // base64 puro (sem data:image/...)
    buf = Buffer.from(source.replace(/^data:[^;]+;base64,/, ""), "base64");
  }

  // ── 1. Redimensionar para tamanho de análise padronizado ──────────────────
  // 200×267 ≈ proporção 4:5 (Instagram feed). Pequeno o suficiente para ser rápido.
  const W = 200, H = 267;
  const base = sharp(buf).resize(W, H, { fit: "cover", position: "centre" }).removeAlpha();

  // Executar stats globais + raw em paralelo
  const [stats, raw] = await Promise.all([
    base.clone().stats(),
    base.clone().raw().toBuffer(),
  ]);

  const pixels = new Uint8Array(raw);

  // ── 2. Entropy global ─────────────────────────────────────────────────────
  const entropy_level = Number(normEntropy(stats.entropy).toFixed(3));

  // ── 3. Quadrantes ─────────────────────────────────────────────────────────
  const q = splitQuadrants(pixels, W, H);
  const qs = {
    tl: quadStats(q.tl),
    tr: quadStats(q.tr),
    bl: quadStats(q.bl),
    br: quadStats(q.br),
  };

  // ── 4. Brightness zones ────────────────────────────────────────────────────
  const brightness_zones = {
    top:    brightness((qs.tl.luminance_mean + qs.tr.luminance_mean) / 2),
    bottom: brightness((qs.bl.luminance_mean + qs.br.luminance_mean) / 2),
    left:   brightness((qs.tl.luminance_mean + qs.bl.luminance_mean) / 2),
    right:  brightness((qs.tr.luminance_mean + qs.br.luminance_mean) / 2),
  };

  // ── 5. Subject position (maior desvio padrão = mais detalhado = sujeito) ──
  const stdMap = { tl: qs.tl.luminance_std, tr: qs.tr.luminance_std, bl: qs.bl.luminance_std, br: qs.br.luminance_std };
  const stdVals = Object.values(stdMap);
  const maxStd  = Math.max(...stdVals);
  const minStd  = Math.min(...stdVals);
  const stdRange = maxStd - minStd;

  let subject_position: BackgroundAnalysis["subject_position"];

  if (stdRange < 10) {
    // Desvios muito homogêneos → sujeito ocupa o frame todo
    subject_position = "full";
  } else {
    // Compara atividade nos dois lados e cima/baixo
    const leftStd   = qs.tl.luminance_std + qs.bl.luminance_std;
    const rightStd  = qs.tr.luminance_std + qs.br.luminance_std;
    const topStd    = qs.tl.luminance_std + qs.tr.luminance_std;
    const bottomStd = qs.bl.luminance_std + qs.br.luminance_std;
    const sides     = { left: leftStd, right: rightStd, top: topStd, bottom: bottomStd };
    const dominant  = (Object.entries(sides) as [string, number][]).sort((a, b) => b[1] - a[1])[0][0];
    subject_position = dominant as BackgroundAnalysis["subject_position"];
  }

  // ── 6. Depth of field (delta de sharpness entre quadrantes) ───────────────
  const depth_of_field: BackgroundAnalysis["depth_of_field"] =
    stdRange > 35 ? "shallow" :
    stdRange > 15 ? "mixed"   : "deep";

  // ── 7. Temperatura de cor (Red vs Blue global) ────────────────────────────
  const rMean = stats.channels[0]?.mean ?? 128;
  const bMean = stats.channels[2]?.mean ?? 128;
  const colorDiff = rMean - bMean;

  const color_temperature: BackgroundAnalysis["color_temperature"] =
    colorDiff > 18  ? "warm" :
    colorDiff < -18 ? "cool" : "neutral";

  // ── 8. Safe areas (quadrantes com variância baixa = fundo limpo) ──────────
  // Um quadrante é "seguro" se seu desvio padrão for < 60% do máximo global.
  const safeThreshold = maxStd * 0.60;

  let safe_areas = new Set<BackgroundAnalysis["safe_areas"][number]>();

  if (qs.tl.luminance_std < safeThreshold) safe_areas.add("top-left");
  if (qs.tr.luminance_std < safeThreshold) safe_areas.add("top-right");
  if (qs.bl.luminance_std < safeThreshold) safe_areas.add("bottom-left");
  if (qs.br.luminance_std < safeThreshold) safe_areas.add("bottom-right");

  // Zonas full-width se ambos os lados do topo/base forem seguros
  if (qs.tl.luminance_std < safeThreshold && qs.tr.luminance_std < safeThreshold)
    safe_areas.add("top-full");
  if (qs.bl.luminance_std < safeThreshold && qs.br.luminance_std < safeThreshold)
    safe_areas.add("bottom-full");

  // Fallback: ao menos uma área segura (a de menor desvio)
  if (safe_areas.size === 0) {
    const minEntry = (Object.entries(stdMap) as [string, number][])
      .sort((a, b) => a[1] - b[1])[0][0];
    const fb: BackgroundAnalysis["safe_areas"][number] =
      minEntry === "tl" ? "top-left"     :
      minEntry === "tr" ? "top-right"    :
      minEntry === "bl" ? "bottom-left"  : "bottom-right";
    safe_areas.add(fb);
  }

  // ── 9. Dominant colors ────────────────────────────────────────────────────
  const dominant_colors: string[] = [
    toHex(stats.dominant.r, stats.dominant.g, stats.dominant.b),
    toHex(qs.tl.r_mean, qs.tl.g_mean, qs.tl.b_mean),
    toHex(qs.tr.r_mean, qs.tr.g_mean, qs.tr.b_mean),
    toHex(qs.bl.r_mean, qs.bl.g_mean, qs.bl.b_mean),
    toHex(qs.br.r_mean, qs.br.g_mean, qs.br.b_mean),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);

  // ── 10. Google Cloud Vision API — focal points reais ─────────────────────
  // Quando disponível, substitui os proxies Sharp para subject_position e safe_areas.
  // Non-fatal: qualquer falha cai de volta nos valores já calculados pelo Sharp.
  let focal_points: BackgroundAnalysis["focal_points"] = undefined;

  if (isVisionEnabled()) {
    try {
      const apiKey = getVisionApiKey()!;
      // Passar base64 puro (Sharp analisou 200×267 — mandamos a imagem original para Vision)
      const base64ForVision = Buffer.isBuffer(source)
        ? source.toString("base64")
        : typeof source === "string" && !source.startsWith("http")
          ? source.replace(/^data:[^;]+;base64,/, "")
          : null;

      if (base64ForVision) {
        focal_points = await detectFocalPoints(base64ForVision, apiKey);

        if (focal_points.length > 0) {
          // Sobrescreve proxies Sharp com dados reais de visão computacional
          subject_position = focalPointsToSubjectPosition(focal_points);
          safe_areas       = new Set(focalPointsToSafeAreas(focal_points));
          console.log(
            `[image-analysis] Vision API: ${focal_points.length} focal point(s),`,
            `subject=${subject_position}, safe_areas=[${[...safe_areas].join(", ")}]`,
          );
        }
      }
    } catch (visionErr) {
      console.warn("[image-analysis] Vision API falhou (non-fatal, usando Sharp proxy):", visionErr);
    }
  }

  // ── 11. Montar resultado ──────────────────────────────────────────────────
  return {
    entropy_level,
    subject_position,
    depth_of_field,
    brightness_zones,
    color_temperature,
    safe_areas:     [...safe_areas],
    dominant_colors,
    ...(focal_points ? { focal_points } : {}),
  };
}
