import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { deleteFromR2 } from "@/lib/r2";

// ── DELETE — remove a moodboard item ─────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id, itemId } = await params;

    const itemDoc = await adminDb
      .collection("clients")
      .doc(client_id)
      .collection("moodboard")
      .doc(itemId)
      .get();

    if (!itemDoc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = itemDoc.data()!;
    if (data.agency_id !== user.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete file from R2
    await deleteFromR2(data.r2_key as string);

    // Delete Firestore document
    await itemDoc.ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[DELETE /api/clients/[id]/moodboard/[itemId]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
