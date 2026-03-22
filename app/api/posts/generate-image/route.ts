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

async function pollTask(task_id: string, maxWait = 60_000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    const res  = await fetch(`https://api.freepik.com/v1/ai/${task_id}`, {
      headers: { "x-freepik-api-key": FREEPIK_API_KEY },
    });
    const data = await res.json();

    if (data.data?.status === "COMPLETED") {
      return data.data?.generated?.[0]?.url ?? null;
    }
    if (data.data?.status === "FAILED") return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { post_id } = await req.json();
  if (!post_id) return NextResponse.json({ error: "post_id é obrigatório" }, { status: 400 });

  // Carrega o post
  const postDoc = await adminDb.collection("posts").doc(post_id).get();
  if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const post   = postDoc.data()!;
  const aspect = ASPECT_RATIO[post.format] ?? "square_1_1";

  // Busca cor primária do cliente
  const clientDoc  = await adminDb.collection("clients").doc(post.client_id).get();
  const primaryColor = clientDoc.data()?.primary_color ?? "#6d28d9";

  // Marca como generating
  await postDoc.ref.update({ status: "generating" });

  // Chama Freepik Mystic
  const freepikRes = await fetch(FREEPIK_BASE, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-freepik-api-key": FREEPIK_API_KEY,
    },
    body: JSON.stringify({
      prompt: post.visual_prompt,
      aspect_ratio: aspect,
      realism: true,
      styling: {
        colors: [{ color: primaryColor, weight: 0.5 }],
      },
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

  // Polling
  const image_url = await pollTask(task_id);

  if (!image_url) {
    await postDoc.ref.update({ status: "ready" });
    return NextResponse.json({ error: "Timeout ou falha na geração da imagem" }, { status: 504 });
  }

  // Atualiza Firestore
  await postDoc.ref.update({ image_url, status: "ready" });

  return NextResponse.json({ image_url });
}
