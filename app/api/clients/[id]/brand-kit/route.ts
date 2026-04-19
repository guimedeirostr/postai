import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;
  const snap = await adminDb.doc(paths.brandKit(user.uid, clientId)).get();
  return NextResponse.json({ brandKit: snap.exists ? snap.data() : null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: clientId } = await params;
  const body = await req.json();

  await adminDb.doc(paths.brandKit(user.uid, clientId)).set(
    { ...body, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return NextResponse.json({ ok: true });
}
