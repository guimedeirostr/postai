/**
 * POST /api/posts/generate-linkedin-images
 *
 * Gera imagens para posts LinkedIn após o copy estar pronto.
 *
 * linkedin_post:
 *   - Dispara geração de imagem AI (landscape 16:9) via provider configurado
 *   - Composita logo no canto (sem texto overlay)
 *   - Retorna { image_url, composed_url }
 *
 * linkedin_carousel:
 *   - Renderiza todos os slides (1080×1080) via compositor
 *   - Retorna { linkedin_slide_urls: string[] }
 *
 * Body: { post_id }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import {
  createTask,
  createSeedreamTask,
  freepikAspect,
  FreepikAuthError,
  isSeedreamEnabled,
} from "@/lib/freepik";
import {
  generateImage as imagenGenerate,
  isImagen4Enabled,
  resolveImagenModel,
  ImagenError,
} from "@/lib/imagen";
import {
  generateImageFal,
  isFalEnabled,
  resolveFalModel,
  FalError,
} from "@/lib/fal";
import {
  composeLinkedInPost,
  composeLinkedInCarouselSlide,
} from "@/lib/composer-linkedin";
import type { GeneratedPost } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as { post_id?: string };
    const { post_id } = body;

    if (!post_id) return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });

    // Fetch post
    const postRef = adminDb.collection("posts").doc(post_id);
    const postDoc = await postRef.get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post = { id: postDoc.id, ...postDoc.data() } as GeneratedPost;

    if (post.format !== "linkedin_post" && post.format !== "linkedin_carousel") {
      return NextResponse.json({ error: "Este endpoint é exclusivo para posts LinkedIn" }, { status: 400 });
    }

    // Fetch client for logo and brand colors
    const clientDoc = await adminDb.collection("clients").doc(post.client_id).get();
    const client = clientDoc.exists ? clientDoc.data() : null;
    const logoUrl        = client?.logo_url ?? null;
    const primaryColor   = client?.primary_color   ?? "#1e40af";
    const secondaryColor = client?.secondary_color ?? "#93c5fd";

    // ──────────────────────────────────────────────────────────────────────────
    // linkedin_carousel — render slides, no AI image needed
    // ──────────────────────────────────────────────────────────────────────────

    if (post.format === "linkedin_carousel") {
      const slides = post.slides;
      if (!slides?.length) {
        return NextResponse.json({ error: "Post não contém slides. Regenere o copy." }, { status: 422 });
      }

      const slideUrls = await Promise.all(
        slides.map((slide, idx) =>
          composeLinkedInCarouselSlide({
            slide,
            idx,
            total:         slides.length,
            logoUrl,
            clientName:    post.client_name,
            primaryColor,
            secondaryColor,
            postId:        post_id,
          })
        )
      );

      await postRef.update({ linkedin_slide_urls: slideUrls, status: "ready" });

      return NextResponse.json({ linkedin_slide_urls: slideUrls });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // linkedin_post — AI image (landscape) + composite logo
    // ──────────────────────────────────────────────────────────────────────────

    const visualPrompt = post.visual_prompt ?? "";
    const format       = "linkedin_post";

    await postRef.update({ status: "generating" });

    let rawImageUrl: string | null = null;
    let imageProvider = "freepik";
    let freepikTaskId: string | undefined;

    try {
      if (isFalEnabled()) {
        imageProvider = "fal";
        const model = resolveFalModel();
        rawImageUrl = await generateImageFal({
          prompt:  visualPrompt,
          format:  "feed", // FAL uses format only for aspect — we handle ratio via ASPECT_RATIO map
          post_id,
          model,
        });
        // Re-generate with correct aspect using direct API call override
        // (generateImageFal uses ASPECT_RATIO["feed"] = "3:4", but LinkedIn needs "16:9")
        // So call FAL directly with the right aspect ratio
        rawImageUrl = await generateFalLinkedInPost(visualPrompt, post_id, model);
      } else if (isImagen4Enabled()) {
        imageProvider = "imagen4";
        rawImageUrl = await imagenGenerate({
          prompt:  visualPrompt,
          format:  "feed", // fallback — imagen handles ratio via FORMAT_ASPECT which we updated
          post_id,
          model:   resolveImagenModel(),
        });
      } else if (isSeedreamEnabled()) {
        imageProvider = "seedream";
        const { task_id } = await createSeedreamTask({
          prompt:       visualPrompt,
          aspect_ratio: freepikAspect(format, "seedream"),
        });
        freepikTaskId = task_id;
        // Async — client polls via check-image
        await postRef.update({
          freepik_task_id: task_id,
          image_provider:  "seedream",
          status:          "generating",
        });
        return NextResponse.json({ task_id, status: "generating" });
      } else {
        // Freepik Mystic (default)
        const { task_id } = await createTask({
          prompt:       visualPrompt,
          aspect_ratio: freepikAspect(format, "mystic"),
          realism:      true,
        });
        freepikTaskId = task_id;
        await postRef.update({
          freepik_task_id: task_id,
          image_provider:  "freepik",
          status:          "generating",
        });
        return NextResponse.json({ task_id, status: "generating" });
      }
    } catch (imgErr) {
      const msg = imgErr instanceof FreepikAuthError
        ? imgErr.message
        : imgErr instanceof ImagenError || imgErr instanceof FalError
          ? imgErr.message
          : String(imgErr);
      console.error("[generate-linkedin-images] image generation error:", msg);
      await postRef.update({ status: "failed" });
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // Sync providers (fal, imagen4) — compose immediately
    await postRef.update({ image_url: rawImageUrl, image_provider: imageProvider });

    const composedUrl = await composeLinkedInPost({
      imageUrl:     rawImageUrl,
      logoUrl,
      primaryColor,
      postId:       post_id,
    }).catch(e => {
      console.warn("[generate-linkedin-images] compose failed:", e);
      return null;
    });

    await postRef.update({
      composed_url: composedUrl,
      status:       "ready",
    });

    return NextResponse.json({ image_url: rawImageUrl, composed_url: composedUrl });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-linkedin-images]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── FAL.ai helper for 16:9 LinkedIn landscape ─────────────────────────────────

async function generateFalLinkedInPost(
  prompt:  string,
  post_id: string,
  model:   string
): Promise<string> {
  const { uploadToR2 } = await import("@/lib/r2");

  const res = await fetch(`https://fal.run/${model}`, {
    method:  "POST",
    headers: {
      "Authorization": `Key ${process.env.FALAI_API_KEY ?? ""}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio:          "16:9",
      num_images:            1,
      output_format:         "jpeg",
      sync_mode:             true,
      enable_safety_checker: false,
      num_inference_steps:   28,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FAL.ai [linkedin 16:9] ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { images?: Array<{ url: string }> };
  const url  = data.images?.[0]?.url;
  if (!url) throw new Error("FAL.ai não retornou URL de imagem");

  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem FAL: ${imgRes.status}`);
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  return uploadToR2(`posts/${post_id}/fal-linkedin-raw.jpg`, buffer, "image/jpeg");
}
