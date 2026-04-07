/**
 * POST /api/posts/generate-image
 *
 * Dispara (ou executa) geração de imagem para um post que já tem
 * visual_prompt mas ainda não tem imagem.
 *
 * ── Prioridade de provider ────────────────────────────────────────────────────
 * A seleção segue a ordem:
 *   1. `provider` no body da requisição  (override explícito da UI)
 *   2. IMAGE_PROVIDER env var             (configuração de deployment)
 *   3. post.image_provider no Firestore   (salvo numa geração anterior)
 *   4. "freepik" (default)
 *
 * ── Modos de geração FAL.ai ───────────────────────────────────────────────────
 *   fal          → Flux Pro txt2img padrão
 *   fal_pulid    → Flux + PuLID: trava identidade/rosto via foto de referência
 *   fal_canny    → Flux + ControlNet Canny: trava estrutura/composição
 *   fal_depth    → Flux + ControlNet Depth: trava volume/perspectiva
 *
 * ── Body params ───────────────────────────────────────────────────────────────
 *   post_id              (obrigatório)
 *   provider?            fal | fal_pulid | fal_canny | fal_depth | freepik |
 *                        seedream | imagen4
 *   image_url?           URL de foto da biblioteca (dispara Seedream Edit)
 *   character_lock_url?  URL de foto de rosto para PuLID
 *   control_image_url?   URL de imagem de referência para ControlNet
 *   control_type?        "canny" | "depth"
 *   id_weight?           0.0–1.8  força do character lock (default 1.0)
 *   control_strength?    0.0–1.0  força do ControlNet     (default 0.7)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import {
  createTask,
  createSeedreamTask,
  createSeedreamEditTask,
  freepikAspect,
  FreepikAuthError,
  extractPromptFromImage,
} from "@/lib/freepik";
import {
  generateImage as imagenGenerate,
  isImagen4Enabled,
  resolveImagenModel,
  ImagenError,
} from "@/lib/imagen";
import {
  generateImageFal,
  generateWithCharacterLock,
  generateWithCanny,
  generateWithDepth,
  isFalEnabled,
  resolveFalModel,
  FalError,
} from "@/lib/fal";
import {
  compilePromptForProvider,
  type ImageProvider,
} from "@/lib/prompt-compiler";
import {
  generateImageReplicate,
  isReplicateEnabled,
  type ReplicateImageModel,
} from "@/lib/replicate";
import { composePost } from "@/lib/composer";
import {
  loadDnaSources,
  resolveArtDirection,
  toComposeOverrides,
} from "@/lib/art-direction-resolver";
import { analyzeImage } from "@/lib/image-analysis";
import { composeLayerStack, layerStackToLayoutPrompt } from "@/lib/art-direction-engine";
import type { ArtDirection, BrandProfile, GeneratedPost, ReferenceDNA, BackgroundAnalysis, ToneProfile, LayerStack } from "@/types";

// Aguarda até 120s — PuLID e ControlNet podem ser mais lentos
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      post_id,
      provider: providerOverride,
      image_url:          libraryImageUrl,
      character_lock_url: characterLockUrl,
      control_image_url:  controlImageUrl,
      control_type,
      id_weight,
      control_strength,
      replicate_model,
    } = await req.json() as {
      post_id:             string;
      provider?:           string;
      image_url?:          string;
      character_lock_url?: string;
      control_image_url?:  string;
      control_type?:       "canny" | "depth";
      id_weight?:          number;
      control_strength?:   number;
      replicate_model?:    ReplicateImageModel;
    };

    if (!post_id) {
      return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });
    }

    // ── Carregar post ──────────────────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post = postDoc.data()!;
    if (!post.visual_prompt) {
      return NextResponse.json(
        { error: "Post sem visual_prompt — rode generate-copy primeiro" },
        { status: 400 }
      );
    }

    await postDoc.ref.update({ status: "generating" });

    // ── Resolver provider final ────────────────────────────────────────────────
    // Lógica: override explícito > env > post salvo > default
    const resolvedProvider = (
      providerOverride
      ?? process.env.IMAGE_PROVIDER
      ?? (post.image_provider as string | undefined)
      ?? "freepik"
    ) as ImageProvider;

    // ── Compilar prompt otimizado para o provider ──────────────────────────────
    // Se o post tem art_direction estruturado, usa o compilador.
    // Caso contrário, usa o visual_prompt bruto (fallback).
    const artDirection = post.art_direction as ArtDirection | undefined;
    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const client       = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    const basePrompt = artDirection
      ? compilePromptForProvider(resolvedProvider, artDirection, client).final
      : (post.visual_prompt as string);

    // ═══════════════════════════════════════════════════════════════════════════
    // FAL.ai — paths avançados
    // ═══════════════════════════════════════════════════════════════════════════

    // ── FAL PuLID: Character / Face Identity Lock ──────────────────────────────
    if (
      resolvedProvider === "fal_pulid" ||
      (isFalEnabled() && characterLockUrl)
    ) {
      if (!characterLockUrl) {
        return NextResponse.json(
          { error: "character_lock_url é obrigatório para fal_pulid" },
          { status: 400 }
        );
      }

      const compiledNeg = artDirection
        ? compilePromptForProvider("fal_pulid", artDirection, client).negative
        : undefined;

      const image_url = await generateWithCharacterLock({
        prompt:          basePrompt,
        reference_urls:  [characterLockUrl],
        format:          post.format as "feed" | "stories" | "reels_cover",
        post_id,
        id_weight:       id_weight   ?? 1.0,
        negative_prompt: compiledNeg,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:     "fal_pulid",
        character_lock_url: characterLockUrl,
        status:             "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_pulid" });
    }

    // ── FAL ControlNet Canny: Structure / Composition Lock ────────────────────
    if (
      resolvedProvider === "fal_canny" ||
      (isFalEnabled() && controlImageUrl && control_type === "canny")
    ) {
      if (!controlImageUrl) {
        return NextResponse.json(
          { error: "control_image_url é obrigatório para fal_canny" },
          { status: 400 }
        );
      }

      const image_url = await generateWithCanny({
        prompt:        basePrompt,
        control_image: controlImageUrl,
        format:        post.format as "feed" | "stories" | "reels_cover",
        post_id,
        strength:      control_strength ?? 0.7,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:   "fal_canny",
        control_image_url: controlImageUrl,
        control_type:     "canny",
        status:           "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_canny" });
    }

    // ── FAL ControlNet Depth: Volume / Perspective Lock ───────────────────────
    if (
      resolvedProvider === "fal_depth" ||
      (isFalEnabled() && controlImageUrl && control_type === "depth")
    ) {
      if (!controlImageUrl) {
        return NextResponse.json(
          { error: "control_image_url é obrigatório para fal_depth" },
          { status: 400 }
        );
      }

      const image_url = await generateWithDepth({
        prompt:        basePrompt,
        control_image: controlImageUrl,
        format:        post.format as "feed" | "stories" | "reels_cover",
        post_id,
        strength:      control_strength ?? 0.7,
      });

      await postDoc.ref.update({
        image_url,
        image_provider:    "fal_depth",
        control_image_url: controlImageUrl,
        control_type:      "depth",
        status:            "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal_depth" });
    }

    // ── FAL padrão txt2img ────────────────────────────────────────────────────
    if (resolvedProvider === "fal" || isFalEnabled()) {
      const image_url = await generateImageFal({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveFalModel(),
      });

      await postDoc.ref.update({
        image_url,
        image_provider: "fal",
        status:         "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "fal" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Google Imagen 4 (síncrono)
    // ═══════════════════════════════════════════════════════════════════════════

    if (resolvedProvider === "imagen4" || isImagen4Enabled()) {
      const image_url = await imagenGenerate({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveImagenModel(),
      });

      await postDoc.ref.update({
        image_url,
        image_provider: "imagen4",
        status:         "ready",
      });

      return NextResponse.json({ image_url, post_id, provider: "imagen4" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Replicate — hub de modelos externos (Imagen 4 grátis, Flux, Ideogram…)
    // ═══════════════════════════════════════════════════════════════════════════

    if (resolvedProvider === "replicate" || isReplicateEnabled()) {
      const model = replicate_model ?? "google/imagen-4";
      const result = await generateImageReplicate({
        prompt:  basePrompt,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model,
      });

      if (result.done && result.image_url) {
        // Resposta síncrona — imagem já disponível, dispara compositor
        await postDoc.ref.update({
          image_url:      result.image_url,
          image_provider: "replicate",
          status:         "composing",
        });

        let composed_url: string | null = null;
        try {
          const dna = await loadDnaSources(post as GeneratedPost & { reference_dna?: ReferenceDNA });
          const ad  = resolveArtDirection(post, dna.refDna, dna.brandDna);

          composed_url = await composePost({
            imageUrl:         result.image_url,
            logoUrl:          client.logo_url,
            visualHeadline:   (post.visual_headline ?? post.headline ?? client.name) as string,
            instagramHandle:  client.instagram_handle as string | undefined,
            clientName:       client.name,
            primaryColor:     client.primary_color,
            secondaryColor:   client.secondary_color,
            format:           (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
            postId:           post_id,
            ...toComposeOverrides(ad),
          });
          await postDoc.ref.update({ composed_url, status: "ready" });
        } catch (composeErr) {
          console.error("[generate-image/replicate] Compositor error (non-fatal):", composeErr);
          await postDoc.ref.update({ status: "ready" });
        }

        return NextResponse.json({
          image_url:    result.image_url,
          composed_url,
          post_id,
          provider:     "replicate",
        });
      }

      // Ainda processando — frontend fará polling em check-image
      await postDoc.ref.update({
        freepik_task_id: result.task_id,
        image_provider:  "replicate",
      });

      return NextResponse.json({ task_id: result.task_id, post_id, provider: "replicate" });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Freepik — paths assíncronos (frontend faz polling em check-image)
    // ═══════════════════════════════════════════════════════════════════════════

    // ── Foto da biblioteca: composição DIRETA — sem geração de imagem ───────────
    // A foto escolhida pelo usuário é o fundo final. Nenhuma IA toca nela.
    // O overlay (headline, logo, marca) é aplicado pelo compositor usando o
    // DNA extraído no Stage 0 para definir posição e tratamento do overlay.
    // Análise real de pixels via Sharp roda sobre a foto para atualizar o LayerStack.
    if (libraryImageUrl) {
      const dna = await loadDnaSources(post as GeneratedPost & { reference_dna?: ReferenceDNA });
      const ad  = resolveArtDirection(post, dna.refDna, dna.brandDna);

      // ── Análise real da foto da biblioteca ─────────────────────────────────
      let library_layer_stack: LayerStack | null = post.layer_stack as LayerStack | null ?? null;
      try {
        const realBg = await analyzeImage(libraryImageUrl);
        const toneProf = (post.layer_stack as LayerStack | undefined)?.tone_profile
          ?? (post as Record<string, unknown>).tone_profile as ToneProfile | undefined;
        if (toneProf) {
          library_layer_stack = composeLayerStack(realBg, toneProf, client);
          console.log("[generate-image] LayerStack atualizado via Sharp para foto da biblioteca");
        }
      } catch (analysisErr) {
        console.warn("[generate-image] analyzeImage (biblioteca) falhou (non-fatal):", analysisErr);
      }

      await postDoc.ref.update({
        status:       "composing",
        image_url:    libraryImageUrl,
        ...(library_layer_stack ? { layer_stack: library_layer_stack } : {}),
      });

      const composed_url = await composePost({
        imageUrl:            libraryImageUrl,
        logoUrl:             client.logo_url,
        visualHeadline:      (post.visual_headline ?? post.headline ?? client.name) as string,
        instagramHandle:     client.instagram_handle as string | undefined,
        clientName:          client.name,
        primaryColor:        client.primary_color,
        secondaryColor:      client.secondary_color,
        format:              (post.format ?? "feed") as "feed" | "stories" | "reels_cover",
        postId:              post_id,
        ...toComposeOverrides(ad),
      });

      await postDoc.ref.update({
        image_url:      libraryImageUrl,
        composed_url,
        image_provider: "library_direct",
        status:         "ready",
      });

      return NextResponse.json({
        image_url:    libraryImageUrl,
        composed_url,
        post_id,
        provider:     "library_direct",
      });
    }

    // ── Seedream V5 Lite (txt2img assíncrono) ─────────────────────────────────
    if (resolvedProvider === "seedream") {
      const aspect      = freepikAspect(post.format as string, "seedream");
      const { task_id } = await createSeedreamTask({
        prompt:       basePrompt,
        aspect_ratio: aspect,
      });

      await postDoc.ref.update({
        freepik_task_id: task_id,
        image_provider:  "seedream",
      });

      return NextResponse.json({ task_id, post_id, provider: "seedream" });
    }

    // ── Freepik Mystic (default, assíncrono) ──────────────────────────────────
    const primaryColor = client.primary_color ?? "#6d28d9";
    const aspect       = freepikAspect(post.format as string, "mystic");

    const { task_id } = await createTask({
      prompt:       basePrompt,
      aspect_ratio: aspect,
      realism:      true,
      styling:      { colors: [{ color: primaryColor, weight: 0.5 }] },
    });

    await postDoc.ref.update({
      freepik_task_id: task_id,
      image_provider:  "freepik",
    });

    return NextResponse.json({ task_id, post_id, provider: "freepik" });

  } catch (err: unknown) {
    if (
      err instanceof FreepikAuthError ||
      err instanceof ImagenError      ||
      err instanceof FalError
    ) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
