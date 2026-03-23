import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { adminDb } from "@/lib/firebase-admin";
import { uploadToR2 } from "@/lib/r2";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file     = formData.get("file") as File | null;
    const clientId = formData.get("client_id") as string | null;

    if (!file || !clientId) {
      return NextResponse.json({ error: "file e client_id são obrigatórios" }, { status: 400 });
    }

    // Verifica ownership
    const clientDoc = await adminDb.collection("clients").doc(clientId).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key    = `logos/${user.uid}/${clientId}/logo.jpg`;

    const publicUrl = await uploadToR2(key, buffer, "image/jpeg");

    await adminDb.collection("clients").doc(clientId).update({ logo_url: publicUrl });

    return NextResponse.json({ url: publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/upload-logo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
