import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { adminDb } from "@/lib/firebase-admin";
import { getStorage } from "firebase-admin/storage";
import { getApps } from "firebase-admin/app";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file      = formData.get("file") as File | null;
    const clientId  = formData.get("client_id") as string | null;

    if (!file || !clientId) {
      return NextResponse.json({ error: "file e client_id são obrigatórios" }, { status: 400 });
    }

    // Verifica ownership do cliente
    const clientDoc = await adminDb.collection("clients").doc(clientId).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer    = Buffer.from(await file.arrayBuffer());
    const path      = `logos/${user.uid}/${clientId}/logo.jpg`;

    // Usa a env var do bucket (ex: postai-xxx.appspot.com ou postai-xxx.firebasestorage.app)
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucketName) {
      return NextResponse.json({ error: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET não configurado" }, { status: 500 });
    }

    const bucket  = getStorage(getApps()[0]).bucket(bucketName);
    const fileRef = bucket.file(path);

    await fileRef.save(buffer, { contentType: "image/jpeg", public: true });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${path}`;

    await adminDb.collection("clients").doc(clientId).update({ logo_url: publicUrl });

    return NextResponse.json({ url: publicUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/upload-logo]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
