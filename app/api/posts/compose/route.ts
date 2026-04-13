/**
 * POST /api/posts/compose
 *
 * Compõe o post final: AI image + overlay de marca (logo, headline, handle, gradiente).
 * Salva o resultado como `composed_url` no Firestore e retorna a URL pública.
 *
 * Body: {
 *   post_id:        string;
 *   image_url?:     string;       — override: usa esta imagem ao invés da do post
 *   font_family?:   string;       — família tipográfica selecionada no Compositor
 *   font_color?:    string;       — cor hex do texto (ex: "#FFFFFF")
 *   text_position?: string;       — "top" | "center" | "bottom-left" | "bottom-full"
 *   logo_placement?: string;      — "top-left" | "top-right" | "bottom-right" | "none" etc.
 *   footer_visible?: boolean;     — exibe faixa com @handle no rodapé
 * }
 *
 * Pode ser chamado:
 *  - Automaticamente pelo /api/posts/generate (providers síncronos: imagen4, fal)
 *  - Automaticamente pelo /api/posts/check-image (Freepik, quando polling completa)
 *  - Manualmente pelo frontend (botão "Compor Post Final" no CompositorNode)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { composePost } from "@/lib/composer";
import {
  loadDnaSources,
  resolveArtDirection,
  toComposeOverrides,
} from "@/lib/art-direction-resolver";
import type { BrandProfile, GeneratedPost, LogoPlacement, ReferenceDNA } from "@/types";

// Composição leva ~5-12s (fetch imagem + fetch logo + satori + sharp)
export const maxDuration = 60;

// ── text_position → compositionZone mapping ───────────────────────────────────

type TextPosition = "top" | "center" | "bottom-left" | "bottom-full";
type CompositionZone = "top" | "center" | "bottom" | "left" | "right";

function textPositionToZone(pos: string | undefined): CompositionZone | undefined {
  if (!pos) return undefined;
  const map: Record<TextPosition, CompositionZone> = {
    "top":          "top",
    "center":       "center",
    "bottom-left":  "bottom",
    "bottom-full":  "bottom",
  };
  return map[pos as TextPosition] ?? undefined;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      post_id:         string;
      image_url?:      string;
      font_family?:    string;
      font_color?:     string;
      text_position?:  string;
      logo_placement?: string;
      footer_visible?: boolean;
    };

    const {
      post_id,
      font_family,
      font_color,
      text_position,
      logo_placement,
      footer_visible,
    } = body;

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

    // Se veio override de imagem, salva no post antes de compor
    if (imageUrlOverride) {
      await postDoc.ref.update({ image_url: imageUrlOverride });
    }

    // ── Salvar overrides visuais no Firestore ─────────────────────────────────
    // O art-direction-resolver vai usar esses campos na cascade quando presentes.
    const visualOverrides: Record<string, unknown> = {};
    if (font_family)               visualOverrides.headline_style_override = font_family;
    if (logo_placement)            visualOverrides.logo_placement_override  = logo_placement;
    if (text_position)             visualOverrides.text_position_override   = text_position;
    if (footer_visible !== undefined) visualOverrides.footer_visible        = footer_visible;

    if (Object.keys(visualOverrides).length > 0) {
      await postDoc.ref.update(visualOverrides);
    }

    // ── Carregar dados do cliente ─────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    if (!clientDoc.exists) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Marcar como "composing" ───────────────────────────────────────────────
    await postDoc.ref.update({ status: "composing" });

    // ── Resolver direção de arte (cascade: art_direction → ref_dna → brand_dna) ─
    const dna = await loadDnaSources(post as GeneratedPost & { reference_dna?: ReferenceDNA });
    const ad  = resolveArtDirection(post, dna.refDna, dna.brandDna);

    // ── Aplicar overrides manuais do Compositor (máxima prioridade) ───────────
    const manualZone    = textPositionToZone(text_position);
    const manualLogo    = logo_placement as LogoPlacement | undefined;
    const manualHeadlineStyle = font_family ?? undefined;

    const composed_url = await composePost({
      imageUrl:             imageUrl,
      logoUrl:              client.logo_url,
      visualHeadline:       post.visual_headline ?? post.headline ?? client.name,
      instagramHandle:      footer_visible === false ? undefined : client.instagram_handle,
      clientName:           client.name,
      primaryColor:         client.primary_color,
      secondaryColor:       font_color ?? client.secondary_color,
      format:               post.format ?? "feed",
      postId:               post_id,
      // Manual overrides take priority, then fall back to DNA cascade
      ...toComposeOverrides(ad),
      ...(manualZone         ? { compositionZone:  manualZone }         : {}),
      ...(manualLogo         ? { logoPlacement:    manualLogo }         : {}),
      ...(manualHeadlineStyle? { headlineStyle:    manualHeadlineStyle }: {}),
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
