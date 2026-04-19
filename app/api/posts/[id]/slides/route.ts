/**
 * GET /api/posts/[id]/slides
 * Returns slides for a V3 post (resolved from collectionGroup).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import type { SlideV3 } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: postId } = await params;

    // Resolve owner + clientId
    const postsSnap = await adminDb
      .collectionGroup("posts")
      .where("ownerUid", "==", user.uid)
      .limit(200)
      .get();

    const postDoc = postsSnap.docs.find(d => d.id === postId);
    if (!postDoc) return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });

    const pathParts = postDoc.ref.path.split("/");
    const clientId  = pathParts[3];

    const slidesSnap = await adminDb
      .collection(`users/${user.uid}/clients/${clientId}/posts/${postId}/slides`)
      .orderBy("order", "asc")
      .get();

    const slides = slidesSnap.docs.map(d => ({ id: d.id, ...d.data() } as SlideV3));

    return NextResponse.json({ slides, clientId, postData: { id: postDoc.id, ...postDoc.data() } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts/[id]/slides]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
