import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { createTask, createSeedreamEditTask, isSeedreamEnabled, freepikAspect, FreepikAuthError } from "@/lib/freepik";


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

    const post = postDoc.data()!;

    // Do NOT include visual_prompt here — it describes a new scene and would
    // cause Freepik to replace the user's chosen photo. Only send a quality
    // enhancement hint so Freepik improves lighting/sharpness while keeping
    // the exact subjects, composition, and faces intact.
    const layoutPrompt   = (post.layout_prompt as string) ?? "";
    const refinementHint = "Ultra high quality professional photography. Preserve exactly the subjects, faces, objects, colors, and composition of the input image. Only enhance lighting, sharpness, and photographic quality. Do not change the scene.";
    const combinedPrompt = [layoutPrompt, refinementHint].filter(Boolean).join(" ").slice(0, 2000);

    await postDoc.ref.update({ status: "generating" });

    let task_id: string;

    if (isSeedreamEnabled()) {
      // Seedream Edit uses reference_images array (base64 or URL)
      const aspect = freepikAspect(post.format as string, "seedream");
      ({ task_id } = await createSeedreamEditTask({
        prompt:           combinedPrompt,
        aspect_ratio:     aspect,
        reference_images: [canvas_base64],
      }));
      await postDoc.ref.update({ freepik_task_id: task_id, image_provider: "seedream" });
    } else {
      // Mystic img2img
      const aspect = freepikAspect(post.format as string, "mystic");
      ({ task_id } = await createTask({
        prompt:       combinedPrompt,
        aspect_ratio: aspect,
        realism:      true,
        image:        canvas_base64,
        image_weight: 0.85,
      }));
      await postDoc.ref.update({ freepik_task_id: task_id, image_provider: "freepik" });
    }

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
