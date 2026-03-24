import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { createTask, FreepikAuthError } from "@/lib/freepik";

const ASPECT_RATIO: Record<string, string> = {
  feed:        "social_post_4_5",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

/**
 * POST /api/posts/refine-image
 * Body: { post_id: string; canvas_base64: string }
 *
 * Sends the canvas-composed art (with text overlays burned in) to Freepik
 * as an img2img input, asking for a higher-quality, AI-refined version
 * that preserves the design composition.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { post_id, canvas_base64 } = (await req.json()) as {
      post_id: string;
      canvas_base64: string;
    };

    if (!post_id || !canvas_base64) {
      return NextResponse.json({ error: "post_id e canvas_base64 são obrigatórios" }, { status: 400 });
    }

    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post   = postDoc.data()!;
    const aspect = ASPECT_RATIO[post.format] ?? "social_post_4_5";

    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";

    const basePrompt     = (post.visual_prompt as string) ?? "";
    const layoutPrompt   = (post.layout_prompt as string) ?? "";
    const refinementHint = "Ultra high quality professional photography. Preserve the text overlay composition and layout. Enhance lighting, colors and photographic quality.";
    const combinedPrompt = [basePrompt, layoutPrompt, refinementHint].filter(Boolean).join(" ").slice(0, 2000);

    await postDoc.ref.update({ status: "generating" });

    const { task_id } = await createTask({
      prompt:       combinedPrompt,
      aspect_ratio: aspect,
      realism:      true,
      image:        canvas_base64,
      image_weight: 0.55,
      styling:      { colors: [{ color: primaryColor, weight: 0.4 }] },
    });

    await postDoc.ref.update({ freepik_task_id: task_id });

    return NextResponse.json({ task_id, post_id });
  } catch (err: unknown) {
    if (err instanceof FreepikAuthError) {
      console.error("[POST /api/posts/refine-image] Auth error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/refine-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
