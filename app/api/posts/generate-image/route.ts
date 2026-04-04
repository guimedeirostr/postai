/**
 * POST /api/posts/generate-image
 *
 * Kicks off (or executes) image generation for an existing post that
 * already has a visual_prompt but no image yet.
 *
 * Supports two providers via IMAGE_PROVIDER env var:
 *
 * IMAGE_PROVIDER=imagen4  (default when set)
 *   → Synchronous: Imagen 4 generates the image, uploads to R2, updates post.
 *   → Response: { image_url, post_id }  (no task_id, no polling needed)
 *
 * IMAGE_PROVIDER=freepik  (or unset)
 *   → Async: Freepik Mystic creates a task.
 *   → Response: { task_id, post_id }  (frontend polls /api/posts/check-image)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { createTask, FreepikAuthError } from "@/lib/freepik";
import { generateImage as imagenGenerate, isImagen4Enabled, resolveImagenModel, ImagenError } from "@/lib/imagen";

// Allow up to 60s for synchronous Imagen 4 generation
export const maxDuration = 60;

// Freepik aspect ratios (only used when IMAGE_PROVIDER != imagen4)
const FREEPIK_ASPECT: Record<string, string> = {
  feed:        "social_post_4_5",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { post_id } = await req.json();
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

    // ── Imagen 4 path (synchronous) ─────────────────────────────────────────────
    if (isImagen4Enabled()) {
      const image_url = await imagenGenerate({
        prompt:  post.visual_prompt as string,
        format:  post.format as "feed" | "stories" | "reels_cover",
        post_id,
        model:   resolveImagenModel(),
      });

      await postDoc.ref.update({
        image_url,
        image_provider: "imagen4",
        status:         "ready",
      });

      return NextResponse.json({ image_url, post_id });
    }

    // ── Freepik path (async — frontend polls check-image) ───────────────────────
    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";
    const aspect       = FREEPIK_ASPECT[post.format as string] ?? "square_1_1";

    const { task_id } = await createTask({
      prompt:       post.visual_prompt as string,
      aspect_ratio: aspect,
      realism:      true,
      styling:      { colors: [{ color: primaryColor, weight: 0.5 }] },
    });

    await postDoc.ref.update({ freepik_task_id: task_id, image_provider: "freepik" });

    return NextResponse.json({ task_id, post_id });

  } catch (err: unknown) {
    if (err instanceof FreepikAuthError || err instanceof ImagenError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
