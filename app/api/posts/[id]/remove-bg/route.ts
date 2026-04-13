import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { removeBackground, RemoveBgError } from "@/lib/remove-bg";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const postDoc = await adminDb.collection("posts").doc(id).get();

    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const data     = postDoc.data()!;
    // Prefer composed (text overlay already baked) over raw image
    const sourceUrl: string | undefined = data.composed_url ?? data.image_url;

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "Post ainda não tem imagem gerada" },
        { status: 400 },
      );
    }

    const r2Key          = `posts/${id}/transparent-${Date.now()}.png`;
    const transparentUrl = await removeBackground(sourceUrl, r2Key);

    await adminDb.collection("posts").doc(id).update({ transparent_url: transparentUrl });

    return NextResponse.json({ transparent_url: transparentUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    const status  = err instanceof RemoveBgError ? (err.status ?? 500) : 500;
    console.error("[POST /api/posts/[id]/remove-bg]", message);
    return NextResponse.json({ error: message }, { status });
  }
}
