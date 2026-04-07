/**
 * POST /api/posts/compose
 *
 * Compõe o post final: AI image + overlay de marca (logo, headline, handle, gradiente).
 * Salva o resultado como `composed_url` no Firestore e retorna a URL pública.
 *
 * Body: { post_id: string }
 *
 * Pode ser chamado:
 *  - Automaticamente pelo /api/posts/generate (providers síncronos: imagen4, fal)
 *  - Automaticamente pelo /api/posts/check-image (Freepik, quando polling completa)
 *  - Manualmente pelo frontend (botão "Compor Post")
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { composePost } from "@/lib/composer";
import type { BrandProfile, GeneratedPost, ReferenceDNA } from "@/types";

// Composição leva ~5-12s (fetch imagem + fetch logo + satori + sharp)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { post_id: string; image_url?: string };
    const { post_id } = body;
    if (!post_id) {
      return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });
    }

    // ── Carregar post ─────────────────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post = postDoc.data() as GeneratedPost;

    // Verificar ownership
    if (post.agency_id !== user.uid) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Se image_url foi passado no body, usa ele (modo "Minha Foto" da biblioteca)
    const imageUrlOverride = body.image_url ?? null;
    const imageUrl = imageUrlOverride ?? post.image_url;

    // Precisa ter image_url para compor
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Post ainda não tem imagem gerada. Aguarde a geração e tente novamente." },
        { status: 422 }
      );
    }

    // Se veio override, salva no post antes de compor
    if (imageUrlOverride) {
      await postDoc.ref.update({ image_url: imageUrlOverride });
    }

    // ── Carregar dados do cliente ─────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Marcar como "composing" ───────────────────────────────────────────────
    await postDoc.ref.update({ status: "composing" });

    // ── Compor o post ─────────────────────────────────────────────────────────
    const refDna = (post as GeneratedPost & { reference_dna?: ReferenceDNA }).reference_dna;

    const composed_url = await composePost({
      imageUrl:             imageUrl,
      logoUrl:              client.logo_url,
      visualHeadline:       post.visual_headline ?? post.headline ?? client.name,
      instagramHandle:      client.instagram_handle,
      clientName:           client.name,
      primaryColor:         client.primary_color,
      secondaryColor:       client.secondary_color,
      format:               post.format ?? "feed",
      postId:               post_id,
      compositionZone:      refDna?.composition_zone,
      backgroundTreatment:  refDna?.background_treatment,
    });

    // ── Atualizar Firestore ───────────────────────────────────────────────────
    await postDoc.ref.update({
      composed_url,
      status: "ready",
    });

    return NextResponse.json({ composed_url, post_id, ok: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/compose]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
