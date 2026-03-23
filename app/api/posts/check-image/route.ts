import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

const FREEPIK_API_KEY = process.env.FREEPIK_API_KEY ?? "";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const task_id = req.nextUrl.searchParams.get("task_id");
    const post_id = req.nextUrl.searchParams.get("post_id");

    if (!task_id || !post_id) {
      return NextResponse.json({ error: "task_id e post_id sao obrigatorios" }, { status: 400 });
    }

    const res  = await fetch(`https://api.freepik.com/v1/ai/${task_id}`, {
      headers: { "x-freepik-api-key": FREEPIK_API_KEY },
    });
    const data = await res.json();
    const status = data.data?.status as string | undefined;

    if (status === "COMPLETED") {
      const image_url = data.data?.generated?.[0]?.url as string | null;
      if (image_url) {
        await adminDb.collection("posts").doc(post_id).update({ image_url, status: "ready" });
        return NextResponse.json({ status: "COMPLETED", image_url });
      }
      return NextResponse.json({ status: "FAILED", error: "URL nao retornada" });
    }

    if (status === "FAILED") {
      await adminDb.collection("posts").doc(post_id).update({ status: "ready" });
      return NextResponse.json({ status: "FAILED", error: "Geracao falhou no Freepik" });
    }

    return NextResponse.json({ status: status ?? "PENDING" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts/check-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
