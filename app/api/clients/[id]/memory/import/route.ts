/**
 * POST /api/clients/[id]/memory/import
 * Importa um post existente (de fora da plataforma) para a memória do cliente.
 * Aceita multipart/form-data com campos de copy + imagem opcional.
 * Se imagem fornecida: faz upload para R2 e analisa com Claude Vision.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { uploadToR2 } from "@/lib/r2";
import { analyzePostImage } from "@/lib/ai/vision";
import { appendImported } from "@/lib/ai/memory";
import { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import type { PostExample, PostFormat, PostSlide, PostEngagement } from "@/types";
import type { Timestamp } from "firebase/firestore";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: clientId } = await params;

    // Ownership check
    const clientDoc = await adminDb.collection("clients").doc(clientId).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // Parse multipart form data
    const formData = await req.formData();

    const caption = formData.get("caption") as string | null;
    if (!caption || !caption.trim()) {
      return NextResponse.json({ error: "caption é obrigatório", code: "MISSING_CAPTION" }, { status: 400 });
    }

    const format   = (formData.get("format") as PostFormat | null) ?? "feed";
    const headline = (formData.get("headline") as string | null) ?? undefined;
    const visual_headline = (formData.get("visual_headline") as string | null) ?? undefined;

    // Parse optional JSON fields
    let hashtags: string[] | undefined;
    const hashtagsRaw = formData.get("hashtags") as string | null;
    if (hashtagsRaw) {
      try { hashtags = JSON.parse(hashtagsRaw) as string[]; } catch { /* ignore */ }
    }

    let slides: PostSlide[] | undefined;
    const slidesRaw = formData.get("slides") as string | null;
    if (slidesRaw) {
      try { slides = JSON.parse(slidesRaw) as PostSlide[]; } catch { /* ignore */ }
    }

    let engagement: PostEngagement | undefined;
    const engagementRaw = formData.get("engagement") as string | null;
    if (engagementRaw) {
      try { engagement = JSON.parse(engagementRaw) as PostEngagement; } catch { /* ignore */ }
    }

    const pilar       = (formData.get("pilar")       as string | null) ?? undefined;
    const hook_type   = (formData.get("hook_type")   as string | null) ?? undefined;
    const objetivo    = (formData.get("objetivo")    as string | null) ?? undefined;
    const publishedAt = (formData.get("publishedAt") as string | null) ?? undefined;

    // Handle image
    let imageUrl: string | undefined;
    let visualDesign: PostExample["visualDesign"];

    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      // Read file as buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Determine extension from mime type
      const mimeType  = imageFile.type || "image/jpeg";
      const extMap: Record<string, string> = {
        "image/jpeg": "jpg",
        "image/png":  "png",
        "image/gif":  "gif",
        "image/webp": "webp",
      };
      const ext = extMap[mimeType] ?? "jpg";

      // Upload to R2
      const r2Key = `memory-imports/${clientId}/${crypto.randomUUID()}.${ext}`;
      imageUrl = await uploadToR2(r2Key, buffer, mimeType);

      // Analyze with Claude Vision
      const base64 = buffer.toString("base64");
      visualDesign = await analyzePostImage(base64, mimeType);
    }

    // Build PostExample
    const example: PostExample = {
      id:              crypto.randomUUID(),
      source:          "import",
      format,
      caption:         caption.trim(),
      headline,
      visual_headline,
      hashtags,
      slides,
      pilar,
      hook_type,
      objetivo,
      imageUrl,
      visualDesign,
      engagement,
      publishedAt,
      importedAt: AdminTimestamp.now() as unknown as Timestamp,
    };

    // Persist to Firestore via memory helper
    await appendImported(user.uid, clientId, example);

    return NextResponse.json({ ok: true, example });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/memory/import]", message);
    return NextResponse.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
