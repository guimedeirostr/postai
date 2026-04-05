import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { pollTask, pollSeedreamTask, pollSeedreamEditTask, FreepikAuthError } from "@/lib/freepik";
import { composePost } from "@/lib/composer";
import type { BrandProfile } from "@/types";

// Precisa de tempo para Freepik poll + compositor (satori + sharp + R2 upload)
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const task_id = req.nextUrl.searchParams.get("task_id");
    const post_id = req.nextUrl.searchParams.get("post_id");

    if (!task_id || !post_id) {
      return NextResponse.json({ error: "task_id e post_id são obrigatórios" }, { status: 400 });
    }

    // Determine which poll endpoint to use based on image_provider stored on the post
    const postSnap0 = await adminDb.collection("posts").doc(post_id).get();
    const provider  = (postSnap0.data()?.image_provider as string | undefined) ?? "freepik";
    const result    = provider === "seedream_edit"
      ? await pollSeedreamEditTask(task_id)
      : provider === "seedream"
        ? await pollSeedreamTask(task_id)
        : await pollTask(task_id);

    if (result.status === "COMPLETED") {
      if (!result.image_url) {
        console.error("[check-image] COMPLETED mas sem URL. Raw:", JSON.stringify(result.raw));
        return NextResponse.json({ status: "FAILED", error: "URL não retornada pela Freepik" });
      }

      // Salvar image_url e disparar o compositor
      const postRef = adminDb.collection("posts").doc(post_id);
      await postRef.update({ image_url: result.image_url, status: "composing" });

      let composed_url: string | null = null;
      try {
        const postSnap   = await postRef.get();
        const post       = postSnap.data()!;
        const clientSnap = await adminDb.collection("clients").doc(post.client_id).get();
        const client     = { id: clientSnap.id, ...clientSnap.data() } as BrandProfile;

        composed_url = await composePost({
          imageUrl:        result.image_url,
          logoUrl:         client.logo_url,
          visualHeadline:  post.visual_headline ?? post.headline ?? client.name,
          instagramHandle: client.instagram_handle,
          clientName:      client.name,
          primaryColor:    client.primary_color,
          secondaryColor:  client.secondary_color,
          format:          post.format ?? "feed",
          postId:          post_id,
        });
        await postRef.update({ composed_url, status: "ready" });
      } catch (composeErr) {
        console.error("[check-image] Compositor error (non-fatal):", composeErr);
        await postRef.update({ status: "ready" });
      }

      return NextResponse.json({
        status:       "COMPLETED",
        image_url:    result.image_url,
        composed_url,
      });
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
