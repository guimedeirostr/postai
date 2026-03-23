import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photo_id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id, photo_id } = await params;

    const photoDoc = await adminDb.collection("photos").doc(photo_id).get();
    if (!photoDoc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = photoDoc.data()!;
    if (data.agency_id !== user.uid || data.client_id !== client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete file from R2
    await deleteFromR2(data.r2_key as string);

    // Delete Firestore document
    await photoDoc.ref.delete();

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[DELETE /api/clients/[id]/photos/[photo_id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
