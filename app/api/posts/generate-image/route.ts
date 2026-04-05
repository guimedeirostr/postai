/**
 * POST /api/posts/generate-image
 *
 * Kicks off (or executes) image generation for an existing post that
 * already has a visual_prompt but no image yet.
 *
 * Provider priority (highest to lowest):
 *   1. FAL.ai — if FAL_KEY env is set
 *   2. Imagen 4 — if IMAGE_PROVIDER=imagen4
 *   3. Seedream V5 Lite — if post.image_provider="seedream" (set by user in modal)
 *   4. Mystic — default (post.image_provider="mystic" or IMAGE_PROVIDER env fallback)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { createTask, createSeedreamTask, createSeedreamEditTask, freepikAspect, FreepikAuthError } from "@/lib/freepik";
import { generateImage as imagenGenerate, isImagen4Enabled, resolveImagenModel, ImagenError } from "@/lib/imagen";
import { generateImageFal, isFalEnabled, resolveFalModel, FalError } from "@/lib/fal";

// Allow up to 60s for synchronous Imagen 4 generation
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { post_id, image_url: libraryImageUrl } = await req.json() as {
      post_id: string;
      image_url?: string; // optional — passed when using a library photo (triggers Seedream Edit)
    };
    if (!post_id) return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });

    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post = postDoc.data()!;
    if (!post.visual_prompt) {
      return NextResponse.json({ error: "Post sem visual_prompt — rode generate-copy primeiro" }, { status: 400 });
    }

    await postDoc.ref.update({ status: "generating" });

    // ── FAL.ai path (synchronous) ────────────────────────────────────────────────
    if (isFalEnabled()) {
      const image_url = await generateImageFal({
        prompt:  post.visual_prompt as string,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveFalModel(),
      });
      await postDoc.ref.update({ image_url, image_provider: "fal", status: "ready" });
      return NextResponse.json({ image_url, post_id });
    }

    // ── Imagen 4 path (synchronous) ──────────────────────────────────────────────
    if (isImagen4Enabled()) {
      const image_url = await imagenGenerate({
        prompt:  post.visual_prompt as string,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveImagenModel(),
      });
      await postDoc.ref.update({ image_url, image_provider: "imagen4", status: "ready" });
      return NextResponse.json({ image_url, post_id });
    }

    // ── Seedream Edit path — library photo as reference image ────────────────────
    // Triggered when the user picks a photo from the brand library.
    // We download it and send as reference_image to Seedream Edit so the model
    // preserves subjects/faces while applying the visual_prompt style.
    if (libraryImageUrl) {
      const aspect = freepikAspect(post.format as string, "seedream");

      // Download the library image and convert to base64
      const imgRes = await fetch(libraryImageUrl, { signal: AbortSignal.timeout(15_000) });
      if (!imgRes.ok) {
        return NextResponse.json(
          { error: `Não foi possível baixar a imagem da biblioteca: HTTP ${imgRes.status}` },
          { status: 422 }
        );
      }
      const imgBuf   = await imgRes.arrayBuffer();
      const imgB64   = Buffer.from(imgBuf).toString("base64");
      const ct       = imgRes.headers.get("content-type") ?? "image/jpeg";
      const mimeType = ct.split(";")[0].trim();
      const dataUri  = `data:${mimeType};base64,${imgB64}`;

      const { task_id } = await createSeedreamEditTask({
        prompt:           post.visual_prompt as string,
        aspect_ratio:     aspect,
        reference_images: [dataUri],
      });

      await postDoc.ref.update({
        freepik_task_id: task_id,
        image_provider:  "seedream_edit",
        image_url:       libraryImageUrl, // save original for raw view fallback
      });

      return NextResponse.json({ task_id, post_id });
    }

    // ── Seedream V5 Lite path — chosen by user in modal OR env fallback ──────────
    const postProvider = (post.image_provider as string | undefined) ?? process.env.IMAGE_PROVIDER ?? "mystic";

    if (postProvider === "seedream") {
      const aspect      = freepikAspect(post.format as string, "seedream");
      const { task_id } = await createSeedreamTask({
        prompt:       post.visual_prompt as string,
        aspect_ratio: aspect,
      });
      await postDoc.ref.update({ freepik_task_id: task_id, image_provider: "seedream" });
      return NextResponse.json({ task_id, post_id });
    }

    // ── Freepik Mystic path (default) ────────────────────────────────────────────
    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";
    const aspect       = freepikAspect(post.format as string, "mystic");

    const { task_id } = await createTask({
      prompt:       post.visual_prompt as string,
      aspect_ratio: aspect,
      realism:      true,
      styling:      { colors: [{ color: primaryColor, weight: 0.5 }] },
    });

    await postDoc.ref.update({ freepik_task_id: task_id, image_provider: "freepik" });

    return NextResponse.json({ task_id, post_id });

  } catch (err: unknown) {
    if (err instanceof FreepikAuthError || err instanceof ImagenError || err instanceof FalError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
