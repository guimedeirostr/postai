import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/r2";
import { processPhoto, fetchRemotePhoto } from "@/lib/image-processor";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; photo_id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id, photo_id } = await params;

    // Load photo document
    const photoDoc = await adminDb.collection("photos").doc(photo_id).get();
    if (!photoDoc.exists) {
      return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    }
    const data = photoDoc.data()!;
    if (data.agency_id !== user.uid || data.client_id !== client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optional processing params from request body
    const body = await req.json().catch(() => ({})) as {
      cropFormat?: "feed" | "stories" | "reels_cover";
      enhance?: boolean;
      rotate?: 90 | 180 | 270;
    };

    // 1. Fetch original from its current public URL (works for any bucket)
    const raw = await fetchRemotePhoto(data.url as string);

    // 2. Process: auto-rotate EXIF + manual rotation + optional smart crop + enhance
    const processed = await processPhoto(raw, {
      maxSize:    1920,
      quality:    88,
      enhance:    body.enhance ?? false,
      cropFormat: body.cropFormat,
      rotate:     body.rotate,
    });

    // 3. Upload to PostAI R2 as enhanced copy
    const basename = (data.filename as string).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
    const key      = `photos/${user.uid}/${client_id}/enhanced/${Date.now()}-${basename}.jpg`;
    const newUrl   = await uploadToR2(key, processed, "image/jpeg");

    // 4. Update Firestore with new URL + mark as enhanced
    await photoDoc.ref.update({
      url:          newUrl,
      r2_key:       key,
      enhanced:     true,
      enhanced_at:  new Date().toISOString(),
    });

    return NextResponse.json({ url: newUrl, enhanced: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/photos/[photo_id]/enhance]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
