/**
 * POST /api/posts/generate-image-gemini
 *
 * Pipeline Gemini 3.1 Flash Image Preview.
 *
 * Arquitetura:
 *   1. Gemini  → gera APENAS o visual/foto (sem texto — evita alucinações)
 *   2. Sharp   → compõe: Logo + Headline (SVG exato) + Footer
 *
 * Body:
 *   post_id        string  (obrigatório)
 *   library_url?   string  — foto da biblioteca para img2img
 *   resolution?    "1K" | "2K" | "4K"   (default: "2K")
 *   logo_size?     "S" | "M" | "L"      (default: "M")
 *
 * Retorna:
 *   { image_url, post_id, provider: "gemini" }
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/r2";
import { generateWithGemini, isGeminiEnabled } from "@/lib/gemini-image";
import type { BrandProfile, BrandDNA, GeneratedPost } from "@/types";

export const maxDuration = 120;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Baixa uma URL pública e retorna { b64, mime } */
async function fetchAsB64(url: string): Promise<{ b64: string; mime: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const b64  = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { b64, mime };
  } catch { return null; }
}

/** Escapa caracteres especiais XML para uso em SVG */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Quebra texto em linhas respeitando o máximo de caracteres por linha */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (test.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Gera buffer SVG com o headline para composição via Sharp.
 * O texto é renderizado pelo Sharp (librsvg) — 100% fiel, sem alucinações.
 */
function buildHeadlineSvg(headline: string, canvasWidth = 1080): Buffer {
  const wordCount   = headline.split(" ").length;
  const fontSize    = wordCount <= 3 ? 96 : wordCount <= 6 ? 82 : wordCount <= 9 ? 68 : 56;
  const maxChars    = wordCount <= 3 ? 14 : wordCount <= 6 ? 18 : wordCount <= 9 ? 22 : 26;
  const lineHeight  = Math.round(fontSize * 1.28);

  const lines      = wrapText(headline, maxChars);
  const svgWidth   = canvasWidth - 80; // 40px margem em cada lado
  const svgHeight  = lines.length * lineHeight + 20;

  const tspans = lines
    .map((line, i) =>
      `<tspan x="${svgWidth / 2}" dy="${i === 0 ? fontSize : lineHeight}">${escapeXml(line)}</tspan>`
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
    <text
      x="${svgWidth / 2}"
      y="0"
      font-family="Arial Black, Arial, Helvetica, sans-serif"
      font-weight="900"
      font-size="${fontSize}"
      fill="#111111"
      text-anchor="middle"
      letter-spacing="-1"
    >${tspans}</text>
  </svg>`;

  return Buffer.from(svg);
}

/** Dimensões da logo por tamanho */
const LOGO_DIMS: Record<string, { w: number; h: number }> = {
  S: { w: 180, h: 54  },
  M: { w: 280, h: 84  },
  L: { w: 400, h: 120 },
};

/**
 * Compõe a imagem final:
 *   1. Redimensiona para 1080×1350
 *   2. Footer colorido (baixo)
 *   3. Headline SVG (centro/baixo)
 *   4. Logo (canto superior esquerdo)
 */
async function composeImage(
  imageBuffer: Buffer,
  client:      BrandProfile,
  headline:    string,
  logoSize:    "S" | "M" | "L" = "M",
): Promise<Buffer> {

  // 1. Resize base
  let base = await sharp(imageBuffer)
    .resize(1080, 1350, { fit: "cover", position: "attention" })
    .toBuffer();

  // 2. Footer bar
  const primary = client.primary_color?.startsWith("#")
    ? client.primary_color
    : `#${client.primary_color ?? "6d28d9"}`;
  const hex = primary.replace("#", "");
  const r   = parseInt(hex.slice(0, 2), 16) || 109;
  const g   = parseInt(hex.slice(2, 4), 16) || 40;
  const b   = parseInt(hex.slice(4, 6), 16) || 217;

  const footer = await sharp({
    create: { width: 1080, height: 72, channels: 4, background: { r, g, b, alpha: 1 } },
  }).png().toBuffer();

  base = await sharp(base)
    .composite([{ input: footer, top: 1350 - 72, left: 0 }])
    .toBuffer();

  // 3. Headline via SVG (Sharp/librsvg renderiza o texto — sem alucinações)
  if (headline.trim()) {
    try {
      const svgBuf    = buildHeadlineSvg(headline, 1080);
      const svgMeta   = await sharp(svgBuf).metadata();
      const svgHeight = svgMeta.height ?? 200;

      // Posição: centro vertical da área útil (abaixo do logo, acima do footer)
      const areaTop    = 160;
      const areaBottom = 1350 - 72;
      const areaCenter = Math.round((areaTop + areaBottom) / 2);
      const top        = Math.max(areaTop, Math.min(areaCenter - Math.round(svgHeight / 2), areaBottom - svgHeight));
      const left       = 40;

      base = await sharp(base)
        .composite([{ input: svgBuf, top, left }])
        .toBuffer();

      console.log(`[gemini/headline] SVG composto — "${headline.slice(0, 40)}", top:${top}, height:${svgHeight}`);
    } catch (txtErr) {
      console.warn("[gemini/headline] Falha ao compor headline:", txtErr instanceof Error ? txtErr.message : txtErr);
    }
  }

  // 4. Logo
  const logoUrl    = client.logo_white_url ?? client.logo_url;
  const isWhite    = !!client.logo_white_url;
  const dims       = LOGO_DIMS[logoSize] ?? LOGO_DIMS.M;
  let   logoPlaced = false;

  if (logoUrl) {
    try {
      console.log(`[gemini/logo] Buscando logo: ${logoUrl.slice(0, 120)}`);
      const logoRes = await fetch(logoUrl, {
        signal:  AbortSignal.timeout(10_000),
        headers: { "User-Agent": "PostAI/1.0" },
      });

      if (!logoRes.ok) {
        console.warn(`[gemini/logo] HTTP ${logoRes.status} — usando fallback SVG`);
      } else {
        const logoBuffer = Buffer.from(await logoRes.arrayBuffer());
        const logoMeta   = await sharp(logoBuffer).metadata();
        const hasAlpha   = (logoMeta.channels ?? 3) === 4;

        let logoSharp = sharp(logoBuffer)
          .resize(dims.w, dims.h, { fit: "inside", withoutEnlargement: false });

        if (!isWhite) {
          if (hasAlpha) {
            logoSharp = logoSharp.negate({ alpha: false });
          } else {
            logoSharp = logoSharp
              .flatten({ background: { r: 255, g: 255, b: 255 } })
              .negate()
              .toColourspace("srgb");
          }
        }

        const logoBuf = await logoSharp.png().toBuffer();
        const topPad  = Math.round((140 - dims.h) / 2);
        base = await sharp(base)
          .composite([{ input: logoBuf, top: Math.max(topPad, 16), left: 44 }])
          .toBuffer();

        logoPlaced = true;
        console.log(`[gemini/logo] Composta — ${dims.w}×${dims.h}px`);
      }
    } catch (logoErr) {
      console.error("[gemini/logo] Erro:", logoErr instanceof Error ? logoErr.message : logoErr);
    }
  }

  // Fallback: nome da marca quando logo falha
  if (!logoPlaced) {
    try {
      const brandName = client.name ?? "Marca";
      const fontSize  = logoSize === "L" ? 36 : logoSize === "S" ? 22 : 28;
      const svgText   = `<svg xmlns="http://www.w3.org/2000/svg" width="${dims.w}" height="${dims.h}">
        <text x="0" y="${Math.round(dims.h * 0.72)}"
          font-family="Arial, Helvetica, sans-serif"
          font-weight="700"
          font-size="${fontSize}"
          fill="white"
          letter-spacing="-0.5">${escapeXml(brandName.toUpperCase())}</text>
      </svg>`;
      const topPad = Math.round((140 - dims.h) / 2);
      base = await sharp(base)
        .composite([{ input: Buffer.from(svgText), top: Math.max(topPad, 16), left: 44 }])
        .toBuffer();
      console.log(`[gemini/logo] Fallback SVG "${brandName}" aplicado`);
    } catch (svgErr) {
      console.warn("[gemini/logo] Fallback SVG falhou:", svgErr instanceof Error ? svgErr.message : svgErr);
    }
  }

  return sharp(base).jpeg({ quality: 95 }).toBuffer();
}

// ── Prompt para o Gemini (APENAS visual — sem texto) ─────────────────────────
function buildGeminiPrompt(
  post:   GeneratedPost,
  client: BrandProfile,
  dna?:   BrandDNA | null,
): string {
  const visual   = (post.visual_prompt ?? "").slice(0, 400);
  const brandDNA = dna?.visual_prompt_template
    ? `Brand visual style: ${dna.visual_prompt_template.slice(0, 300)}`
    : "";

  return [
    `Create a professional Instagram post PHOTO (4:5 portrait).`,
    `This is a PHOTO ONLY — do NOT add any text, words, letters, or typography anywhere in the image.`,
    ``,
    `VISUAL CONCEPT:`,
    visual || "High-quality brand photography, clean and modern.",
    brandDNA ? `\n${brandDNA}` : "",
    ``,
    `DESIGN COLORS (use only for props, backgrounds, accents):`,
    `- Primary: ${client.primary_color ?? "#6d28d9"}`,
    `- Secondary: ${client.secondary_color ?? "#ffffff"}`,
    `- Visual tone: ${(client.tone_of_voice ?? "professional").slice(0, 80)}`,
    ``,
    `RULES:`,
    `- NO text, NO words, NO letters, NO numbers, NO labels anywhere`,
    `- NO logo, NO watermark, NO badge, NO icon`,
    `- NO borders, NO padding`,
    `- Leave the lower half of the image with a clean, light area suitable for text overlay`,
    `- Leave the top-left corner clean (no subjects, no clutter) for logo overlay`,
  ].filter(Boolean).join("\n");
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!isGeminiEnabled()) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY não configurada. Adicione no .env.local." },
        { status: 503 }
      );
    }

    const body = await req.json() as {
      post_id:      string;
      library_url?: string;
      resolution?:  "1K" | "2K" | "4K";
      logo_size?:   "S" | "M" | "L";
    };

    if (!body.post_id) {
      return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });
    }

    const post_id = body.post_id;

    // ── Buscar post + verificar ownership ─────────────────────────────────────
    const postRef = adminDb.collection("posts").doc(post_id);
    const postDoc = await postRef.get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }
    const post = { id: post_id, ...postDoc.data() } as GeneratedPost;

    // ── Buscar cliente ─────────────────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: post.client_id, ...clientDoc.data() } as BrandProfile;

    // ── Buscar DNA da marca (opcional) ────────────────────────────────────────
    let dna: BrandDNA | null = null;
    try {
      const dnaDoc = await adminDb
        .collection("clients").doc(post.client_id)
        .collection("brand_dna").doc("current")
        .get();
      if (dnaDoc.exists) dna = dnaDoc.data() as BrandDNA;
    } catch { /* DNA é opcional */ }

    // ── Resolver imagem de referência ─────────────────────────────────────────
    const libraryUrl = body.library_url ?? (post as unknown as Record<string, unknown>).library_image_url as string | undefined;
    let reference: { b64: string; mime: string } | null = null;

    if (libraryUrl) {
      console.log(`[gemini] Buscando referência: ${libraryUrl}`);
      reference = await fetchAsB64(libraryUrl);
      if (!reference) console.warn("[gemini] Falha ao baixar referência — prosseguindo sem img2img");
    }

    // ── Marcar post como gerando ──────────────────────────────────────────────
    await postRef.update({ status: "generating", image_provider: "gemini" });

    // ── Chamar Gemini (só visual, sem texto) ──────────────────────────────────
    const prompt = buildGeminiPrompt(post, client, dna);
    console.log(`[gemini] Gerando visual — formato: ${post.format ?? "feed"}, resolução: ${body.resolution ?? "2K"}, ref: ${reference ? "sim" : "não"}`);

    const geminiResult = await generateWithGemini({
      prompt,
      format:         (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
      reference_b64:  reference?.b64,
      reference_mime: reference?.mime,
      resolution:     body.resolution ?? "2K",
    });

    // ── Compor: Logo + Headline (SVG) + Footer ────────────────────────────────
    const headline = (post.visual_headline ?? post.headline ?? "").trim();
    const composed = await composeImage(geminiResult.buffer, client, headline, body.logo_size ?? "M");

    // ── Upload para R2 ────────────────────────────────────────────────────────
    const r2Key    = `posts/${user.uid}/${post_id}/gemini-${Date.now()}.jpg`;
    const imageUrl = await uploadToR2(r2Key, composed, "image/jpeg");

    // ── Atualizar post no Firestore ───────────────────────────────────────────
    await postRef.update({
      status:         "ready",
      image_url:      imageUrl,
      image_provider: "gemini",
      updated_at:     new Date().toISOString(),
    });

    console.log(`[gemini] Sucesso — post ${post_id} → ${imageUrl}`);

    return NextResponse.json({
      image_url: imageUrl,
      post_id,
      provider:  "gemini",
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image-gemini]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
