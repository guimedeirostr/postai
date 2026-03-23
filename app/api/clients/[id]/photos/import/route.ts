import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";

// ─── Category mapping from semantic JSON → BrandPhoto category ───────────────
const CATEGORY_MAP: Record<string, string> = {
  "alimento":  "produto",
  "bebida":    "produto",
  "produto":   "produto",
  "objeto":    "outro",
  "ambiente":  "ambiente",
  "equipe":    "equipe",
  "bastidor":  "bastidores",
  "cliente":   "cliente",
};

function mapCategory(raw: string): string {
  const key = raw.toLowerCase().trim();
  return CATEGORY_MAP[key] ?? "outro";
}

// Flatten rich tag structure → string[]
function flattenTags(tags: Record<string, unknown>): string[] {
  const result: Set<string> = new Set();

  // contexto: "Mão, Loja, Interno" → split
  if (typeof tags.contexto === "string") {
    tags.contexto.split(",").forEach(t => { const v = t.trim(); if (v) result.add(v.toLowerCase()); });
  }
  // elementos_principais: string[]
  if (Array.isArray(tags.elementos_principais)) {
    (tags.elementos_principais as string[]).forEach(t => { if (t) result.add(t.toLowerCase()); });
  }
  // cores_dominantes: string[]
  if (Array.isArray(tags.cores_dominantes)) {
    (tags.cores_dominantes as string[]).forEach(t => { if (t) result.add(t.toLowerCase()); });
  }
  // tags_adicionais: string[]
  if (Array.isArray(tags.tags_adicionais)) {
    (tags.tags_adicionais as string[]).forEach(t => { if (t) result.add(t.toLowerCase()); });
  }
  // estilo_visual: "Close-up" etc
  if (typeof tags.estilo_visual === "string" && tags.estilo_visual) {
    result.add(tags.estilo_visual.toLowerCase());
  }
  // qualidade_imagem for filtering: include as meta
  if (typeof tags.qualidade_imagem === "string" && tags.qualidade_imagem) {
    result.add(`qualidade:${tags.qualidade_imagem.toLowerCase()}`);
  }
  // público_alvo
  if (typeof tags.público_alvo === "string" && tags.público_alvo) {
    result.add(`público:${tags.público_alvo.toLowerCase()}`);
  }

  return Array.from(result).filter(Boolean);
}

function buildDescription(tags: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(tags.elementos_principais) && tags.elementos_principais.length > 0) {
    parts.push((tags.elementos_principais as string[])[0]);
  }
  if (typeof tags.contexto === "string") {
    parts.push(tags.contexto);
  }
  if (typeof tags.estilo_visual === "string") {
    parts.push(tags.estilo_visual);
  }
  return parts.join(" · ");
}

interface IncomingPhoto {
  filename: string;
  url?: string;          // internal R2 URL (updated file)
  local_path?: string;
  tags: Record<string, unknown>;
}

interface ImportPayload {
  photos: IncomingPhoto[];
  public_base_url: string;   // ex: https://pub-xxx.r2.dev
  r2_path_prefix?: string;   // ex: Imagens  (default "Imagens")
  internal_base?: string;    // prefix to strip from url (auto-detected if omitted)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    // Verify ownership
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const body = await req.json() as ImportPayload;
    const { photos, public_base_url, r2_path_prefix = "Imagens" } = body;

    if (!photos?.length) {
      return NextResponse.json({ error: "Nenhuma foto no payload" }, { status: 400 });
    }
    if (!public_base_url) {
      return NextResponse.json({ error: "public_base_url é obrigatório" }, { status: 400 });
    }

    const publicBase = public_base_url.replace(/\/$/, "");

    // Firestore batch — 500 max per batch
    let imported = 0;
    let skipped  = 0;
    const errors: string[] = [];

    // Process in batches of 400 to stay safe
    const CHUNK = 400;
    for (let i = 0; i < photos.length; i += CHUNK) {
      const chunk = photos.slice(i, i + CHUNK);
      const batch = adminDb.batch();

      for (const photo of chunk) {
        try {
          const filename = photo.filename;
          if (!filename) { skipped++; continue; }

          // Construct public URL
          const publicUrl = `${publicBase}/${r2_path_prefix}/${filename}`;

          // r2_key is the path within the bucket
          const r2_key = `${r2_path_prefix}/${filename}`;

          const tags        = flattenTags(photo.tags);
          const category    = mapCategory(String(photo.tags.categoria ?? "outro"));
          const description = buildDescription(photo.tags);

          const ref = adminDb.collection("photos").doc();
          batch.set(ref, {
            id:          ref.id,
            agency_id:   user.uid,
            client_id,
            r2_key,
            url:         publicUrl,
            filename,
            category,
            tags,
            description,
            created_at:  FieldValue.serverTimestamp(),
          });
          imported++;
        } catch (e) {
          errors.push(photo.filename ?? "unknown");
          skipped++;
        }
      }

      await batch.commit();
    }

    return NextResponse.json({ imported, skipped, errors: errors.length ? errors : undefined });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/photos/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
