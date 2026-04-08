/**
 * PATCH /api/posts/[id]
 *
 * Atualiza campos editáveis de um post manualmente (sem IA).
 * Campos permitidos: visual_headline, headline, caption
 *
 * Body (JSON): { visual_headline?, headline?, caption? }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

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
