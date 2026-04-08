/**
 * lib/vision.ts
 *
 * Google Cloud Vision API — detecção real de faces e objetos (focal points).
 *
 * Usa a mesma GOOGLE_AI_API_KEY do Imagen 4 (REST puro, sem SDK).
 * Requer que a Vision API esteja ativada no mesmo projeto GCP.
 *
 * O que retorna:
 *   FocalPoint[]  — faces e objetos detectados com bounding box normalizada (0.0–1.0)
 *                   e posição central calculada.
 *
 * Integração com image-analysis.ts:
 *   Os focal_points substituem o proxy de desvio padrão do Sharp para:
 *     • subject_position  (onde o sujeito principal realmente está)
 *     • safe_areas        (quadrantes sem sobreposição com focal points)
 *
 * Custo:
 *   FACE_DETECTION:      $1.50 / 1.000 requests (1.000/mês grátis)
 *   OBJECT_LOCALIZATION: $2.25 / 1.000 requests (1.000/mês grátis)
 *   Cada imagem = 2 unidades (uma por feature)
 */

import type { FocalPoint } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos da API Vision (resposta bruta)
// ─────────────────────────────────────────────────────────────────────────────

interface VisionVertex {
  x?: number;
  y?: number;
}

interface VisionNormalizedVertex {
  x?: number;
  y?: number;
}

interface VisionFaceAnnotation {
  boundingPoly: {
    vertices: VisionVertex[];
  };
  detectionConfidence: number;
}

interface VisionObjectAnnotation {
  name:  string;
  score: number;
  boundingPoly: {
    normalizedVertices: VisionNormalizedVertex[];
  };
}

interface VisionAnnotateResponse {
  responses: Array<{
    faceAnnotations?:             VisionFaceAnnotation[];
    localizedObjectAnnotations?:  VisionObjectAnnotation[];
    error?: { message: string; code: number };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Converte bounding box (normalizada ou pixel) em FocalPoint.bounds (normalizado) */
function normBounds(
  vertices: VisionNormalizedVertex[],
  imageW?:  number,
  imageH?:  number,
): FocalPoint["bounds"] {
  const xs = vertices.map(v => v.x ?? 0);
  const ys = vertices.map(v => v.y ?? 0);

  let minX = Math.min(...xs);
  let minY = Math.min(...ys);
  let maxX = Math.max(...xs);
  let maxY = Math.max(...ys);

  // Se os valores parecem pixel (>1.5), normalizar pela dimensão da imagem
  if (imageW && imageH && (maxX > 1.5 || maxY > 1.5)) {
    minX /= imageW; minY /= imageH;
    maxX /= imageW; maxY /= imageH;
  }

  return {
    x:      Math.max(0, minX),
    y:      Math.max(0, minY),
    width:  Math.min(1, maxX - minX),
    height: Math.min(1, maxY - minY),
  };
}

/** Calcula centro normalizado de um bounds */
function boundsCenter(bounds: FocalPoint["bounds"]): FocalPoint["center"] {
  return {
    x: bounds.x + bounds.width  / 2,
    y: bounds.y + bounds.height / 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: detectFocalPoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta faces e objetos principais na imagem via Google Cloud Vision API.
 *
 * @param imageBase64  Base64 puro da imagem (sem prefixo data:)
 * @param apiKey       Google Cloud API key (GOOGLE_AI_API_KEY ou GOOGLE_VISION_API_KEY)
 * @param imageW       Largura original em pixels (para normalizar coords de face)
 * @param imageH       Altura original em pixels
 *
 * @returns FocalPoint[] ordenados por confidence (maior primeiro)
 */
export async function detectFocalPoints(
  imageBase64: string,
  apiKey:      string,
  imageW = 1080,
  imageH = 1350,
): Promise<FocalPoint[]> {
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const body = {
    requests: [{
      image: { content: imageBase64.replace(/^data:[^;]+;base64,/, "") },
      features: [
        { type: "FACE_DETECTION",      maxResults: 10 },
        { type: "OBJECT_LOCALIZATION", maxResults: 10 },
      ],
    }],
  };

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`[vision] Vision API HTTP ${res.status}`);
  }

  const data = await res.json() as VisionAnnotateResponse;
  const resp = data.responses[0];

  if (resp.error) {
    throw new Error(`[vision] ${resp.error.message} (code ${resp.error.code})`);
  }

  const results: FocalPoint[] = [];

  // ── Faces ─────────────────────────────────────────────────────────────────
  for (const face of resp.faceAnnotations ?? []) {
    if (!face.boundingPoly?.vertices?.length) continue;
    if (face.detectionConfidence < 0.4) continue;

    // Face detection retorna coordenadas em PIXEL — normalizar
    const verts = face.boundingPoly.vertices.map(v => ({
      x: (v.x ?? 0) / imageW,
      y: (v.y ?? 0) / imageH,
    }));

    const bounds = normBounds(verts);
    results.push({
      type:       "face",
      label:      "face",
      confidence: face.detectionConfidence,
      bounds,
      center: boundsCenter(bounds),
    });
  }

  // ── Objetos ────────────────────────────────────────────────────────────────
  for (const obj of resp.localizedObjectAnnotations ?? []) {
    if (!obj.boundingPoly?.normalizedVertices?.length) continue;
    if (obj.score < 0.4) continue;

    const bounds = normBounds(obj.boundingPoly.normalizedVertices);
    results.push({
      type:       "object",
      label:      obj.name,
      confidence: obj.score,
      bounds,
      center: boundsCenter(bounds),
    });
  }

  // Ordenar por confidence (maior primeiro)
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de análise — derivam BackgroundAnalysis a partir de FocalPoint[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deriva subject_position a partir dos focal points de maior confiança.
 * Muito mais preciso que o proxy de desvio padrão do Sharp.
 */
export function focalPointsToSubjectPosition(
  fps: FocalPoint[],
): "left" | "center" | "right" | "top" | "bottom" | "full" {
  if (!fps.length) return "center";

  // Usar só os top-3 mais confiantes para não deixar objetos pequenos dominar
  const top = fps.slice(0, 3);

  // União de todos os bounding boxes
  const minX = Math.min(...top.map(f => f.bounds.x));
  const minY = Math.min(...top.map(f => f.bounds.y));
  const maxX = Math.max(...top.map(f => f.bounds.x + f.bounds.width));
  const maxY = Math.max(...top.map(f => f.bounds.y + f.bounds.height));

  const coverW = maxX - minX;
  const coverH = maxY - minY;
  const cx     = (minX + maxX) / 2;
  const cy     = (minY + maxY) / 2;

  // Se o conjunto de focal points cobre mais de 55% do frame → "full"
  if (coverW > 0.55 && coverH > 0.55) return "full";

  // Posição baseada no centro do conjunto
  if (cx < 0.35)        return "left";
  if (cx > 0.65)        return "right";
  if (cy < 0.35)        return "top";
  if (cy > 0.65)        return "bottom";
  return "center";
}

/**
 * Deriva safe_areas a partir dos focal points.
 * Um quadrante é seguro se não tem sobreposição significativa com nenhum focal point.
 */
export function focalPointsToSafeAreas(
  fps: FocalPoint[],
): Array<"top-left" | "top-right" | "bottom-left" | "bottom-right" | "top-full" | "bottom-full"> {
  if (!fps.length) {
    // Sem focal points detectados → frame inteiro é seguro
    return ["bottom-full", "top-full"];
  }

  // Quadrantes: {x: [0,0.5], y: [0,0.5]} etc.
  const quadrants = {
    "top-left":     { x: [0, 0.5], y: [0, 0.5]  } as const,
    "top-right":    { x: [0.5, 1], y: [0, 0.5]  } as const,
    "bottom-left":  { x: [0, 0.5], y: [0.5, 1]  } as const,
    "bottom-right": { x: [0.5, 1], y: [0.5, 1]  } as const,
  };

  type QuadKey = keyof typeof quadrants;

  function overlapArea(fp: FocalPoint, q: typeof quadrants[QuadKey]): number {
    const ix1 = Math.max(fp.bounds.x, q.x[0]);
    const iy1 = Math.max(fp.bounds.y, q.y[0]);
    const ix2 = Math.min(fp.bounds.x + fp.bounds.width,  q.x[1]);
    const iy2 = Math.min(fp.bounds.y + fp.bounds.height, q.y[1]);
    if (ix2 <= ix1 || iy2 <= iy1) return 0;
    return (ix2 - ix1) * (iy2 - iy1);
  }

  // Threshold: quadrante com <5% de sobreposição com focal points é seguro
  const SAFE_THRESHOLD = 0.05 * 0.25; // 5% da área do quadrante (0.25 do frame)

  const safeQ = (Object.entries(quadrants) as [QuadKey, typeof quadrants[QuadKey]][])
    .filter(([, q]) => {
      const totalOverlap = fps.reduce((sum, fp) => sum + overlapArea(fp, q), 0);
      return totalOverlap < SAFE_THRESHOLD;
    })
    .map(([k]) => k);

  const safe = new Set<ReturnType<typeof focalPointsToSafeAreas>[number]>(safeQ as ReturnType<typeof focalPointsToSafeAreas>);

  // Adicionar zonas full-width se os dois quadrantes do lado forem seguros
  if (safe.has("top-left") && safe.has("top-right"))       safe.add("top-full");
  if (safe.has("bottom-left") && safe.has("bottom-right")) safe.add("bottom-full");

  // Fallback
  if (safe.size === 0) safe.add("bottom-left");

  return [...safe];
}

// ─────────────────────────────────────────────────────────────────────────────
// OCR LEGIBILITY CHECK — auto-correção de contraste
// ─────────────────────────────────────────────────────────────────────────────

interface VisionTextResponse {
  responses: Array<{
    textAnnotations?: Array<{ description: string; confidence?: number }>;
    fullTextAnnotation?: { text: string };
    error?: { message: string };
  }>;
}

/**
 * Verifica se o `expectedText` é legível na imagem composta via OCR.
 *
 * Usado APÓS o compositor (Sharp ou Chromium) para validar que o
 * visual_headline aparece corretamente na arte final. Se o OCR não
 * conseguir ler o texto, o contraste está insuficiente.
 *
 * @param imageBuffer    Buffer JPEG/PNG da imagem composta
 * @param expectedText   Texto esperado (visual_headline)
 * @param apiKey         Google Vision API key
 * @returns { legible, confidence, detectedText }
 */
export async function checkTextLegibility(
  imageBuffer:  Buffer,
  expectedText: string,
  apiKey:       string,
): Promise<{
  legible:      boolean;
  confidence:   number;   // 0.0–1.0
  detectedText: string;
}> {
  const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const base64   = imageBuffer.toString("base64");

  const body = {
    requests: [{
      image:    { content: base64 },
      features: [{ type: "TEXT_DETECTION", maxResults: 10 }],
    }],
  };

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    console.warn("[vision/ocr] HTTP error:", res.status);
    return { legible: true, confidence: 0, detectedText: "" }; // assume OK se Vision falhar
  }

  const data = await res.json() as VisionTextResponse;
  const resp = data.responses[0];

  if (resp.error) {
    console.warn("[vision/ocr] Vision error:", resp.error.message);
    return { legible: true, confidence: 0, detectedText: "" };
  }

  const detectedText = resp.fullTextAnnotation?.text
    ?? resp.textAnnotations?.[0]?.description
    ?? "";

  if (!detectedText) {
    return { legible: false, confidence: 0, detectedText: "" };
  }

  // Normaliza ambos para comparação
  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normExpected = normalize(expectedText);
  const normDetected = normalize(detectedText);

  // Verifica quantas palavras do expected foram encontradas no detected
  const words     = normExpected.split(" ").filter(Boolean);
  const found     = words.filter(w => normDetected.includes(w));
  const confidence = words.length ? found.length / words.length : 0;

  return {
    legible:     confidence >= 0.6, // 60% das palavras detectadas = legível
    confidence,
    detectedText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag
// ─────────────────────────────────────────────────────────────────────────────

/** True se Google Vision API está configurada e pode ser usada */
export function isVisionEnabled(): boolean {
  return !!(process.env.GOOGLE_VISION_API_KEY ?? process.env.GOOGLE_AI_API_KEY);
}

export function getVisionApiKey(): string | null {
  return process.env.GOOGLE_VISION_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? null;
}
