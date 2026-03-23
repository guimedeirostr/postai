import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/r2";
import { FieldValue } from "firebase-admin/firestore";
import { processPhoto } from "@/lib/image-processor";

// GET — list all photos for a client
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const snap = await adminDb
      .collection("photos")
      .where("client_id", "==", client_id)
      .where("agency_id", "==", user.uid)
      .get();

    // Sort in memory — avoids composite Firestore index
    const photos = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const at = (a.created_at as { seconds?: number })?.seconds ?? 0;
        const bt = (b.created_at as { seconds?: number })?.seconds ?? 0;
        return bt - at;
      });

    return NextResponse.json({ photos });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/photos]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — upload a new photo for a client
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Arquivo obrigatório" }, { status: 400 });
    }

    const category    = (formData.get("category")    as string) || "outro";
    const tagsRaw     = (formData.get("tags")         as string) || "";
    const description = (formData.get("description") as string) || "";
    const tags        = tagsRaw.split(",").map(t => t.trim()).filter(Boolean);

    const rawBuffer    = Buffer.from(await file.arrayBuffer());
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "") + ".jpg";
    const key          = `photos/${user.uid}/${client_id}/${Date.now()}-${safeFilename}`;

    // Auto-rotate EXIF + normalize size before storing
    const buffer = await processPhoto(rawBuffer, { maxSize: 1920, quality: 85, enhance: false });

    const url = await uploadToR2(key, buffer, "image/jpeg");

    const ref = adminDb.collection("photos").doc();
    await ref.set({
      id:          ref.id,
      agency_id:   user.uid,
      client_id,
      r2_key:      key,
      url,
      filename:    file.name,
      category,
      tags,
      description,
      created_at:  FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/photos]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
