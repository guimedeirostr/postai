import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId, assetId } = await params;
  const ref  = adminDb.doc(paths.asset(user.uid, clientId, assetId));
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storagePath = snap.data()?.storagePath as string | undefined;
  if (storagePath) {
    await adminStorage().bucket().file(storagePath).delete().catch(() => null);
  }
  await ref.delete();
  return NextResponse.json({ ok: true });
}
