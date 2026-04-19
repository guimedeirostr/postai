/**
 * GET /api/posts/[id]/compiler
 * Returns compiled prompts (V3) for all slides of a post.
 * Looks up the post via collectionGroup to resolve uid + clientId.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import type { CompiledPromptV3, SlideV3 } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: postId } = await params;

    // Resolve uid + clientId from V3 collectionGroup
    const postsSnap = await adminDb
      .collectionGroup("posts")
      .where("ownerUid", "==", user.uid)
      .limit(200)
      .get();

    const postDoc = postsSnap.docs.find(d => d.id === postId);
    if (!postDoc) return NextResponse.json({ error: "Post V3 não encontrado" }, { status: 404 });

    // Path: users/{uid}/clients/{cid}/posts/{pid}
    const pathParts = postDoc.ref.path.split("/");
    const clientId  = pathParts[3];

    // List slides
    const slidesSnap = await adminDb
      .collection(`users/${user.uid}/clients/${clientId}/posts/${postId}/slides`)
      .orderBy("order", "asc")
      .get();

    const slides = slidesSnap.docs.map(d => ({ id: d.id, ...d.data() } as SlideV3));

    // Fetch compiled prompt for each slide
    const compiled: (CompiledPromptV3 & { slideOrder: number })[] = [];
    for (const slide of slides) {
      const cpSnap = await adminDb
        .doc(`users/${user.uid}/clients/${clientId}/posts/${postId}/slides/${slide.id}/compiledPrompt/current`)
        .get();
      if (cpSnap.exists) {
        compiled.push({ ...(cpSnap.data() as CompiledPromptV3), slideOrder: slide.order });
      }
    }

    return NextResponse.json({ slides, compiled, clientId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts/[id]/compiler]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
