import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

// ─── DELETE /api/clients/[id]/design-examples/[example_id] ───────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; example_id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id, example_id } = await params;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    await adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples").doc(example_id)
      .delete();

    return NextResponse.json({ deleted: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[DELETE /api/clients/[id]/design-examples/[example_id]]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
