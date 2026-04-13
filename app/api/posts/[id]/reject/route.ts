/**
 * POST /api/posts/[id]/reject
 *
 * Rejeita um post gerado.
 *
 * Body: { reason?: string }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { GeneratedPost } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // ── Carregar e validar post ───────────────────────────────────────────────
    const postDoc = await adminDb.collection("posts").doc(id).get();
    if (!postDoc.exists) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }
    const post = postDoc.data() as GeneratedPost;
    if (post.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // ── Ler body (reason é opcional) ─────────────────────────────────────────
    let reason: string | null = null;
    try {
      const body = await req.json() as { reason?: string };
      reason = body.reason ?? null;
    } catch {
      // Body vazio ou inválido — não é erro
    }

    // ── Rejeitar post ─────────────────────────────────────────────────────────
    await adminDb.collection("posts").doc(id).update({
      status:           "rejected",
      rejection_reason: reason,
      rejected_at:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/[id]/reject]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
