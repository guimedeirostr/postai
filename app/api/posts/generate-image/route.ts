import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { createTask, FreepikAuthError } from "@/lib/freepik";

// Feed 1080×1350 (4:5), Stories/Reels 1080×1920 (9:16)
const ASPECT_RATIO: Record<string, string> = {
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

    const post   = postDoc.data()!;
    const aspect = ASPECT_RATIO[post.format] ?? "square_1_1";

    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";

    await postDoc.ref.update({ status: "generating" });

    const { task_id } = await createTask({
      prompt:       post.visual_prompt,
      aspect_ratio: aspect,
      realism:      true,
      styling:      { colors: [{ color: primaryColor, weight: 0.5 }] },
    });

    await postDoc.ref.update({ freepik_task_id: task_id });

    return NextResponse.json({ task_id, post_id });
  } catch (err: unknown) {
    if (err instanceof FreepikAuthError) {
      console.error("[POST /api/posts/generate-image] Auth error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
