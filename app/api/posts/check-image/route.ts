import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { pollTask, FreepikAuthError } from "@/lib/freepik";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const task_id = req.nextUrl.searchParams.get("task_id");
    const post_id = req.nextUrl.searchParams.get("post_id");

    if (!task_id || !post_id) {
      return NextResponse.json({ error: "task_id e post_id são obrigatórios" }, { status: 400 });
    }

    const result = await pollTask(task_id);

    if (result.status === "COMPLETED") {
      if (result.image_url) {
        await adminDb.collection("posts").doc(post_id).update({ image_url: result.image_url, status: "ready" });
        return NextResponse.json({ status: "COMPLETED", image_url: result.image_url });
      }
      console.error("[check-image] COMPLETED mas sem URL. Raw:", JSON.stringify(result.raw));
      return NextResponse.json({ status: "FAILED", error: "URL não retornada pela Freepik" });
    }

    if (result.status === "FAILED") {
      await adminDb.collection("posts").doc(post_id).update({ status: "ready" });
      return NextResponse.json({ status: "FAILED", error: "Geração falhou no Freepik" });
    }

    return NextResponse.json({ status: result.status });
  } catch (err: unknown) {
    if (err instanceof FreepikAuthError) {
      console.error("[GET /api/posts/check-image] Auth error:", err.message);
      return NextResponse.json({ error: err.message, status: "FAILED" }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts/check-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
