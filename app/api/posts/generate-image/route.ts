import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY ?? "";
const FREEPIK_BASE    = "https://api.freepik.com/v1/ai/mystic";

const ASPECT_RATIO: Record<string, string> = {
  feed:        "square_1_1",
  stories:     "social_story_9_16",
  reels_cover: "portrait_2_3",
};

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { post_id } = await req.json();
    if (!post_id) return NextResponse.json({ error: "post_id e obrigatorio" }, { status: 400 });

    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post nao encontrado" }, { status: 404 });
    }

    const post   = postDoc.data()!;
    const aspect = ASPECT_RATIO[post.format] ?? "square_1_1";

    const clientDoc    = await adminDb.collection("clients").doc(post.client_id).get();
    const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";

    await postDoc.ref.update({ status: "generating" });

    const freepikRes = await fetch(FREEPIK_BASE, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-freepik-api-key": FREEPIK_API_KEY,
      },
      body: JSON.stringify({
        prompt:       post.visual_prompt,
        aspect_ratio: aspect,
        realism:      true,
        styling: { colors: [{ color: primaryColor, weight: 0.5 }] },
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
      return NextResponse.json({ error: "task_id nao retornado pela Freepik" }, { status: 502 });
    }

    await postDoc.ref.update({ freepik_task_id: task_id });

    return NextResponse.json({ task_id, post_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
