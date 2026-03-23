import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY ?? "";
const FREEPIK_BASE    = "https://api.freepik.com/v1/ai/mystic";

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

    // Load post and verify ownership
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const post   = postDoc.data()!;
    const aspect = ASPECT_RATIO[post.format] ?? "social_post_4_5";

    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";

    // Build refinement prompt — visual + layout context
    const basePrompt     = (post.visual_prompt as string) ?? "";
    const layoutPrompt   = (post.layout_prompt as string) ?? "";
    const refinementHint = "Ultra high quality professional photography. Preserve the text overlay composition and layout. Enhance lighting, colors and photographic quality.";
    const combinedPrompt = [basePrompt, layoutPrompt, refinementHint].filter(Boolean).join(" ").slice(0, 2000);

    await postDoc.ref.update({ status: "generating" });

    // Call Freepik Mystic img2img
    // The `image` field accepts a base64 string; `image_weight` controls how much
    // the output follows the reference (0 = ignore, 1 = exact copy). 0.55 keeps
    // the composition while allowing Freepik to improve quality.
    const freepikRes = await fetch(FREEPIK_BASE, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
      body: JSON.stringify({
        prompt:       combinedPrompt,
        aspect_ratio: aspect,
        realism:      true,
        image:        canvas_base64,
        image_weight: 0.55,
        styling: { colors: [{ color: primaryColor, weight: 0.4 }] },
      }),
    });

    if (!freepikRes.ok) {
      const err = await freepikRes.json().catch(() => ({}));
      await postDoc.ref.update({ status: "ready" });
      return NextResponse.json({ error: "Freepik error", details: err }, { status: 502 });
    }

    const freepikData = await freepikRes.json();
    const task_id     = freepikData.data?.task_id as string | undefined;

    if (!task_id) {
      await postDoc.ref.update({ status: "ready" });
      return NextResponse.json({ error: "task_id não retornado pela Freepik" }, { status: 502 });
    }

    await postDoc.ref.update({ freepik_task_id: task_id });

    return NextResponse.json({ task_id, post_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/refine-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
