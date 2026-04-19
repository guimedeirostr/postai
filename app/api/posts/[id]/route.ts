/**
 * GET  /api/posts/[id]  — lê post por ID (legacy flat OU V3 collectionGroup)
 * PATCH /api/posts/[id] — edita campos de um post legacy
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

// ── normalizePost ─────────────────────────────────────────────────────────────
// Unifica snake_case (legacy) e camelCase (V3) em um shape consistente para a UI.
// Regras:
//   error | failureReason       → failureReason
//   composed_url | image_url    → coverUrl  (+ mantém image_url / composed_url)
//   agency_id | ownerUid        → agencyId  (UI não usa, mas garante consistência)
function normalizePost(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  // error → failureReason
  if (!out.failureReason && out.error)       out.failureReason = out.error;
  if (!out.failureReason && out.fal_error)   out.failureReason = out.fal_error;
  if (!out.failureReason && out.freepik_error) out.failureReason = out.freepik_error;
  if (!out.failureReason && out.imagen_error)  out.failureReason = out.imagen_error;

  // coverUrl fallback
  if (!out.coverUrl) out.coverUrl = out.composed_url ?? out.image_url ?? null;

  return out;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // 1️⃣ Try legacy flat collection first (most posts live here)
    const legacyDoc = await adminDb.collection("posts").doc(id).get();
    if (legacyDoc.exists && legacyDoc.data()?.agency_id === user.uid) {
      const post = normalizePost({ id: legacyDoc.id, ...legacyDoc.data() });
      return NextResponse.json({ post });
    }

    // 2️⃣ Try V3 collectionGroup (users/{uid}/clients/{cid}/posts/{id})
    const v3Snap = await adminDb
      .collectionGroup("posts")
      .where("__name__", "==", id)
      .limit(1)
      .get();

    // collectionGroup by doc ID isn't directly supported — fall back to path scan
    // Use ownerUid index if available, otherwise iterate by postId in path
    if (v3Snap.empty) {
      // Last resort: collectionGroup filtered by ownerUid, then find by id
      const byOwner = await adminDb
        .collectionGroup("posts")
        .where("ownerUid", "==", user.uid)
        .limit(200)
        .get();
      const match = byOwner.docs.find(d => d.id === id);
      if (match) {
        const post = normalizePost({ id: match.id, ...match.data() });
        return NextResponse.json({ post });
      }
    } else {
      const doc = v3Snap.docs[0];
      if (doc.data()?.ownerUid === user.uid) {
        const post = normalizePost({ id: doc.id, ...doc.data() });
        return NextResponse.json({ post });
      }
    }

    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const postRef = adminDb.collection("posts").doc(id);
    const postDoc = await postRef.get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const body = await req.json() as Record<string, unknown>;

    // Whitelist de campos editáveis manualmente
    const ALLOWED = ["visual_headline", "headline", "caption"] as const;
    const updates: Record<string, string> = {};

    for (const key of ALLOWED) {
      if (typeof body[key] === "string") {
        updates[key] = (body[key] as string).trim();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo editável fornecido." },
        { status: 400 }
      );
    }

    await postRef.update({
      ...updates,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[PATCH /api/posts/[id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
