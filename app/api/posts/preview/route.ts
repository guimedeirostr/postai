/**
 * POST /api/posts/preview
 *
 * Renderiza um PREVIEW da composição do post sobre um background placeholder
 * gerado dinamicamente — SEM gastar créditos de Freepik/FAL/Imagen.
 *
 * Permite ao usuário ver exatamente como vão ficar:
 *   - Tipografia (Playfair / Montserrat / Dancing / Inter — resolvida pelo DNA)
 *   - Posição do logo (6 placements possíveis)
 *   - Gradient tint (mood do DNA, com strip respeitando primaryColor)
 *   - Composition zone, headline, handle
 *
 * O placeholder é um gradient diagonal usando a cor resolvida pelo color-mood
 * (mesma cor que o gradient da composição final usaria), garantindo que o
 * preview reflete o mood real da referência.
 *
 * Body: {
 *   client_id:             string,
 *   visual_headline:       string,
 *   format?:               "feed" | "stories" | "reels_cover",
 *   reference_example_id?: string,         // pega DNA já salvo
 *   reference_dna?:        ReferenceDNA,   // ou DNA inline
 * }
 *
 * Response: { preview_url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { composePost } from "@/lib/composer";
import { resolveArtDirection, toComposeOverrides } from "@/lib/art-direction-resolver";
import { resolveGradientColor } from "@/lib/composer/color-mood";
import type { BrandProfile, DesignExample, ReferenceDNA, BrandDNA } from "@/types";

// Composição leva ~3-6s sem fetch externo de imagem
export const maxDuration = 30;

interface PreviewBody {
  client_id:             string;
  visual_headline:       string;
  format?:               "feed" | "stories" | "reels_cover";
  reference_example_id?: string;
  reference_dna?:        ReferenceDNA;
}

/**
 * Gera um placeholder PNG (1080×1350 ou 1080×1920) com gradient diagonal
 * partindo do `tint` resolvido pelo mood + uma cor mais escura/clara.
 * Esse buffer entra direto no compositor como "background" — exatamente
 * como se fosse a imagem AI gerada, mas sem custo de API.
 */
async function buildPlaceholderBackground(
  tint:   string,
  format: "feed" | "stories" | "reels_cover",
): Promise<Buffer> {
  const W = 1080;
  const H = format === "feed" ? 1350 : 1920;

  // SVG inline com gradient diagonal + ruído sutil pra não ficar chapado.
  // Texto "PREVIEW" no canto pra deixar claro que é placeholder.
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="${tint}" stop-opacity="0.95"/>
          <stop offset="50%"  stop-color="${tint}" stop-opacity="0.65"/>
          <stop offset="100%" stop-color="#0a0a0a" stop-opacity="0.95"/>
        </linearGradient>
        <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stop-color="#000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000" stop-opacity="0.45"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <rect width="100%" height="100%" fill="url(#vignette)"/>
      <text x="${W - 40}" y="60" text-anchor="end"
            font-family="sans-serif" font-size="22" font-weight="700"
            fill="#ffffff" fill-opacity="0.55"
            letter-spacing="3">PREVIEW</text>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as PreviewBody;
    const { client_id, visual_headline, format = "feed", reference_example_id } = body;

    if (!client_id || !visual_headline) {
      return NextResponse.json(
        { error: "client_id e visual_headline são obrigatórios" },
        { status: 400 }
      );
    }

    // ── Carrega cliente + ownership ────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Resolve referência: example_id > inline > brand_dna > vazio ──────────
    let refDna: ReferenceDNA | undefined = body.reference_dna;

    if (!refDna && reference_example_id) {
      try {
        const exDoc = await adminDb
          .collection("clients").doc(client_id)
          .collection("design_examples").doc(reference_example_id)
          .get();
        if (exDoc.exists) {
          const ex = exDoc.data() as DesignExample;
          refDna = {
            composition_zone:      ex.composition_zone,
            text_zones:            ex.text_zones ?? "",
            background_treatment:  ex.background_treatment ?? "",
            headline_style:        ex.headline_style ?? "",
            typography_hierarchy:  ex.typography_hierarchy ?? "",
            visual_prompt:         ex.visual_prompt,
            layout_prompt:         ex.layout_prompt,
            color_mood:            ex.color_mood,
            description:           ex.description,
            pilar:                 ex.pilar,
            format:                ex.format,
            visual_headline_style: ex.visual_headline_style,
            ...(ex.logo_placement ? { logo_placement: ex.logo_placement } : {}),
          };
        }
      } catch (e) {
        console.warn("[preview] Falha ao resolver reference_example_id (non-fatal):", e);
      }
    }

    let brandDna: BrandDNA | undefined;
    if (!refDna) {
      try {
        const dnaSnap = await adminDb
          .collection("clients").doc(client_id)
          .collection("brand_dna").doc("current")
          .get();
        if (dnaSnap.exists) brandDna = dnaSnap.data() as BrandDNA;
      } catch { /* non-fatal */ }
    }

    const ad = resolveArtDirection({ client_id }, refDna, brandDna);

    // ── Gera placeholder background pelo mood ──────────────────────────────────
    const tint            = resolveGradientColor(ad.colorMood, client.primary_color);
    const placeholderBuf  = await buildPlaceholderBackground(tint, format);

    // ── Compose com flag preview (salva como preview.jpg) ──────────────────────
    // Usa client_id como postId temporário pra agrupar previews por cliente
    // sem poluir posts/{id}/composed.jpg.
    const previewId    = `preview-${client_id}-${Date.now()}`;
    const preview_url  = await composePost({
      imageBuffer:     placeholderBuf,
      preview:         true,
      logoUrl:         client.logo_url,
      visualHeadline:  visual_headline,
      instagramHandle: client.instagram_handle,
      clientName:      client.name,
      primaryColor:    client.primary_color,
      secondaryColor:  client.secondary_color,
      format,
      postId:          previewId,
      ...toComposeOverrides(ad),
    });

    return NextResponse.json({
      preview_url,
      tint,
      resolved: {
        compositionZone:    ad.compositionZone,
        headlineStyle:      ad.headlineStyle,
        logoPlacement:      ad.logoPlacement,
        backgroundTreatment: ad.backgroundTreatment,
        colorMood:          ad.colorMood,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/preview]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
