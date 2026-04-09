/**
 * POST /api/posts/generate-image-gemini
 *
 * Rota EXPERIMENTAL — pipeline enxuto usando Gemini 3.1 Flash Image Preview.
 *
 * Diferença vs /generate-image:
 *   - SEM polling (retorno síncrono — Gemini gera via streaming e retorna buffer)
 *   - SEM Visual Perception Agent, SEM OCR loop, SEM MiDaS depth
 *   - Gemini gera Foto + Texto nativo em uma chamada
 *   - Sharp só adiciona: Logo + Footer (assinatura da marca)
 *   - Aceita referência de imagem de 2 origens:
 *       A) Foto da biblioteca do cliente (library_url)
 *       B) visual_prompt_template do DNA da marca (fallback textual)
 *
 * Body:
 *   post_id        string  (obrigatório)
 *   library_url?   string  — foto da biblioteca para img2img
 *   resolution?    "1K" | "2K" | "4K"   (default: "2K")
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

export const maxDuration = 120; // Gemini pode levar até 60s em 4K

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

/** Dimensões da logo por tamanho */
const LOGO_DIMS: Record<string, { w: number; h: number }> = {
  S: { w: 180,  h: 54  },
  M: { w: 280,  h: 84  },
  L: { w: 400,  h: 120 },
};

/** Compõe logo e footer sobre o buffer gerado pelo Gemini */
async function addLogoAndFooter(
  imageBuffer: Buffer,
  client:      BrandProfile,
  logoSize:    "S" | "M" | "L" = "M",
): Promise<Buffer> {
  // Redimensiona para 1080×1350 (4:5 Instagram)
  let base = await sharp(imageBuffer)
    .resize(1080, 1350, { fit: "cover", position: "attention" })
    .toBuffer();

  // Footer bar na base (72px com cor primária)
  const primary = client.primary_color?.startsWith("#")
    ? client.primary_color
    : `#${client.primary_color ?? "6d28d9"}`;

  const hex    = primary.replace("#", "");
  const r      = parseInt(hex.slice(0, 2), 16) || 109;
  const g      = parseInt(hex.slice(2, 4), 16) || 40;
  const b      = parseInt(hex.slice(4, 6), 16) || 217;
  const footer = await sharp({
    create: { width: 1080, height: 72, channels: 4, background: { r, g, b, alpha: 1 } },
  }).png().toBuffer();

  base = await sharp(base)
    .composite([{ input: footer, top: 1350 - 72, left: 0 }])
    .toBuffer();

  // Logo (usa logo_white_url em fundo escuro, logo_url como fallback)
  const logoUrl   = client.logo_white_url ?? client.logo_url;
  const isWhite   = !!client.logo_white_url;
  const dims      = LOGO_DIMS[logoSize] ?? LOGO_DIMS.M;
  let   logoPlaced = false;

  if (logoUrl) {
    try {
      console.log(`[gemini/logo] Buscando logo: ${logoUrl.slice(0, 120)}`);
      const logoRes = await fetch(logoUrl, {
        signal:  AbortSignal.timeout(10_000),
        headers: { "User-Agent": "PostAI/1.0" },
      });

      if (!logoRes.ok) {
        console.warn(`[gemini/logo] HTTP ${logoRes.status} ao buscar logo — usando fallback SVG`);
      } else {
        const contentType = logoRes.headers.get("content-type") ?? "";
        console.log(`[gemini/logo] content-type: ${contentType}, size: ${logoRes.headers.get("content-length")} bytes`);

        const logoBuffer = Buffer.from(await logoRes.arrayBuffer());

        // Detectar se tem canal alpha (PNG/WebP) ou não (JPEG)
        const logoMeta = await sharp(logoBuffer).metadata();
        const hasAlpha = (logoMeta.channels ?? 3) === 4;

        let logoSharp = sharp(logoBuffer)
          .resize(dims.w, dims.h, { fit: "inside", withoutEnlargement: false });

        // Negate só para logo padrão (não branca) com transparência — inverte preto→branco
        // Para JPEG (sem alpha), adiciona canal alpha e usa mix-blend ao invés de negate
        if (!isWhite) {
          if (hasAlpha) {
            logoSharp = logoSharp.negate({ alpha: false });
          } else {
            // JPEG: converte para PNG com fundo transparente forçando inversão via flatten
            logoSharp = logoSharp
              .flatten({ background: { r: 255, g: 255, b: 255 } }) // garante fundo branco
              .negate()                                               // inverte tudo (branco→preto, preto→branco)
              .toColourspace("srgb");
          }
        }

        const logoBuf = await logoSharp.png().toBuffer();
        const topPad  = Math.round((140 - (dims.h)) / 2);
        base = await sharp(base)
          .composite([{ input: logoBuf, top: Math.max(topPad, 16), left: 44 }])
          .toBuffer();

        logoPlaced = true;
        console.log(`[gemini/logo] Logo composta com sucesso — ${dims.w}×${dims.h}px, top:${Math.max(topPad, 16)}, left:44`);
      }
    } catch (logoErr) {
      console.error("[gemini/logo] Erro ao processar logo:", logoErr instanceof Error ? logoErr.message : logoErr);
    }
  } else {
    console.warn("[gemini/logo] client.logo_url e client.logo_white_url estão vazios");
  }

  // Fallback: nome da marca em branco no footer quando logo não carregou
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
          letter-spacing="-0.5">${brandName.toUpperCase()}</text>
      </svg>`;
      const svgBuf = Buffer.from(svgText);
      const topPad = Math.round((140 - dims.h) / 2);
      base = await sharp(base)
        .composite([{ input: svgBuf, top: Math.max(topPad, 16), left: 44 }])
        .toBuffer();
      console.log(`[gemini/logo] Fallback SVG com nome "${brandName}" aplicado`);
    } catch (svgErr) {
      console.warn("[gemini/logo] Fallback SVG também falhou:", svgErr instanceof Error ? svgErr.message : svgErr);
    }
  }

  return sharp(base).jpeg({ quality: 95 }).toBuffer();
}

// ── Montar prompt para o Gemini ───────────────────────────────────────────────
function buildGeminiPrompt(
  post:   GeneratedPost,
  client: BrandProfile,
  dna?:   BrandDNA | null,
): string {
  const headline  = (post.visual_headline ?? post.headline ?? "").slice(0, 60);
  const visual    = (post.visual_prompt   ?? "").slice(0, 400);
  const brandDNA  = dna?.visual_prompt_template
    ? `\n\nBrand visual style: ${dna.visual_prompt_template.slice(0, 300)}`
    : "";

  // Instrui o Gemini a compor foto + texto sobrepostos em um único quadro
  return [
    `Create a professional Instagram post image (4:5 portrait).`,
    ``,
    `VISUAL CONCEPT:`,
    visual || "High-quality brand photography, clean and modern.",
    brandDNA,
    ``,
    `DESIGN COLORS (for background/accents only — do NOT render as text):`,
    `- Primary: ${client.primary_color ?? "#6d28d9"}`,
    `- Secondary: ${client.secondary_color ?? "#ffffff"}`,
    `- Visual tone: ${(client.tone_of_voice ?? "professional").slice(0, 80)}`,
    ``,
    `MANDATORY TEXT — copy this EXACTLY, letter by letter, no changes:`,
    `>>> ${headline} <<<`,
    ``,
    `TEXT RULES:`,
    `- Render only the text between >>> and <<<, nothing else`,
    `- Do NOT paraphrase, do NOT repeat words, do NOT add punctuation`,
    `- Use bold, large typography — high contrast against background`,
    `- Place text in the central or lower-central area of the image`,
    ``,
    `STRICT BLANK ZONES — these areas must be 100% empty (no text, no graphics, no brand name, no decorations):`,
    `- TOP-LEFT CORNER: approximately the top 10% height × left 25% width — leave completely empty for logo overlay`,
    `- BOTTOM STRIP: approximately the bottom 6% height — leave completely empty for footer overlay`,
    ``,
    `ABSOLUTE PROHIBITIONS:`,
    `- Do NOT write any brand name, company name, or product name anywhere`,
    `- Do NOT add any logo, icon, badge, or watermark`,
    `- Do NOT add borders or padding`,
    `- Do NOT add any text other than the mandatory headline above`,
  ].join("\n");
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

    // ── Buscar DNA da marca (opcional — enriquece o prompt) ───────────────────
    let dna: BrandDNA | null = null;
    try {
      const dnaDoc = await adminDb
        .collection("clients").doc(post.client_id)
        .collection("brand_dna").doc("current")
        .get();
      if (dnaDoc.exists) dna = dnaDoc.data() as BrandDNA;
    } catch { /* DNA é opcional */ }

    // ── Resolver imagem de referência ─────────────────────────────────────────
    // Prioridade: 1. library_url do body  2. library_url salvo no post
    const libraryUrl = body.library_url ?? (post as unknown as Record<string, unknown>).library_image_url as string | undefined;
    let reference: { b64: string; mime: string } | null = null;

    if (libraryUrl) {
      console.log(`[gemini] Buscando referência de biblioteca: ${libraryUrl}`);
      reference = await fetchAsB64(libraryUrl);
      if (!reference) {
        console.warn("[gemini] Falha ao baixar referência — prosseguindo sem img2img");
      }
    } else if (dna?.visual_prompt_template) {
      // Sem foto: usa template de DNA no prompt (já incluso em buildGeminiPrompt)
      console.log("[gemini] Sem referência de foto — usando DNA textual no prompt");
    }

    // ── Marcar post como gerando ──────────────────────────────────────────────
    await postRef.update({ status: "generating", image_provider: "gemini" });

    // ── Chamar Gemini ─────────────────────────────────────────────────────────
    const prompt = buildGeminiPrompt(post, client, dna);
    console.log(`[gemini] Gerando imagem — formato: ${post.format ?? "feed"}, resolução: ${body.resolution ?? "2K"}, ref: ${reference ? "sim" : "não"}`);

    const geminiResult = await generateWithGemini({
      prompt,
      format:         (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
      reference_b64:  reference?.b64,
      reference_mime: reference?.mime,
      resolution:     body.resolution ?? "2K",
    });

    // ── Compor: Logo + Footer ─────────────────────────────────────────────────
    const composed = await addLogoAndFooter(geminiResult.buffer, client, body.logo_size ?? "M");

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
      ...(geminiResult.text ? { model_text: geminiResult.text } : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image-gemini]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
