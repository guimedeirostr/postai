import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";

// ─── Category mapping from semantic JSON → BrandPhoto category ────────────────
const CATEGORY_MAP: Record<string, string> = {
  alimento:   "produto",
  bebida:     "produto",
  produto:    "produto",
  objeto:     "outro",
  ambiente:   "ambiente",
  equipe:     "equipe",
  bastidores: "bastidores",
  bastidor:   "bastidores",
  cliente:    "cliente",
};

function mapCategory(raw?: string): string {
  if (!raw) return "outro";
  return CATEGORY_MAP[raw.toLowerCase().trim()] ?? "outro";
}

// Flatten rich semantic tag structure → flat string[]
// Handles undefined/null gracefully (inventory-only JSONs have no tags)
function flattenTags(tags?: Record<string, unknown>): string[] {
  if (!tags) return [];
  const result = new Set<string>();

  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) result.add(v.trim().toLowerCase());
  };

  // contexto: "Mão, Loja, Interno" → split by comma
  if (typeof tags.contexto === "string") {
    tags.contexto.split(",").forEach(add);
  }
  // array fields
  for (const field of ["elementos_principais", "cores_dominantes", "tags_adicionais"]) {
    if (Array.isArray(tags[field])) {
      (tags[field] as unknown[]).forEach(add);
    }
  }
  if (typeof tags.estilo_visual === "string")   add(tags.estilo_visual);
  if (typeof tags.qualidade_imagem === "string") add(`qualidade:${tags.qualidade_imagem}`);
  if (typeof tags.público_alvo    === "string") add(`público:${tags.público_alvo}`);

  return Array.from(result).filter(Boolean);
}

function buildDescription(tags?: Record<string, unknown>): string {
  if (!tags) return "";
  const parts: string[] = [];
  if (Array.isArray(tags.elementos_principais) && tags.elementos_principais.length > 0) {
    parts.push(String(tags.elementos_principais[0]));
  }
  if (typeof tags.contexto    === "string") parts.push(tags.contexto);
  if (typeof tags.estilo_visual === "string") parts.push(tags.estilo_visual);
  return parts.join(" · ");
}

// ─── Dual-format URL construction ─────────────────────────────────────────────
// Format A (semantic): filename = "20260128_094358.jpg"   (no path)
// Format B (inventory): filename = "Imagens/20260128_094358.jpg" (includes folder)
function resolveUrl(
  filename: string,
  publicBase: string,
  r2_path_prefix: string
): { url: string; r2_key: string; basename: string } {
  const hasPath = filename.includes("/");

  if (hasPath) {
    // filename already contains the folder (e.g. "Imagens/photo.jpg")
    const basename = filename.split("/").pop() ?? filename;
    return {
      url:      `${publicBase}/${filename}`,
      r2_key:   filename,
      basename,
    };
  } else {
    // plain filename — prepend configured prefix
    const prefix = r2_path_prefix.replace(/^\/|\/$/g, "");
    return {
      url:      prefix ? `${publicBase}/${prefix}/${filename}` : `${publicBase}/${filename}`,
      r2_key:   prefix ? `${prefix}/${filename}` : filename,
      basename: filename,
    };
  }
}

interface IncomingPhoto {
  filename?: string;
  url?: string;
  local_path?: string;
  size?: number;
  tags?: Record<string, unknown>;
}

interface ImportPayload {
  photos: IncomingPhoto[];
  public_base_url: string;   // ex: https://pub-xxx.r2.dev
  r2_path_prefix?: string;   // ex: Imagens  (used only when filename has no path)
}

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

    let imported = 0;
    let skipped  = 0;
    const failures: { filename: string; reason: string }[] = [];

    // Batch in chunks of 400 (Firestore limit is 500)
    const CHUNK = 400;
    for (let i = 0; i < photos.length; i += CHUNK) {
      const chunk = photos.slice(i, i + CHUNK);
      const batch = adminDb.batch();
      const chunkImported: number[] = []; // track which photos were staged in this batch

      for (const photo of chunk) {
        try {
          const rawFilename = photo.filename?.trim();
          if (!rawFilename) {
            skipped++;
            failures.push({ filename: "(sem filename)", reason: "filename ausente ou vazio" });
            continue;
          }

          const { url, r2_key, basename } = resolveUrl(rawFilename, publicBase, r2_path_prefix);
          const tags        = flattenTags(photo.tags);
          const category    = mapCategory(String(photo.tags?.categoria ?? "outro"));
          const description = buildDescription(photo.tags);

          const ref = adminDb.collection("photos").doc();
          batch.set(ref, {
            id:          ref.id,
            agency_id:   user.uid,
            client_id,
            r2_key,
            url,
            filename:    basename,
            category,
            tags,
            description,
            created_at:  FieldValue.serverTimestamp(),
          });
          chunkImported.push(1);
        } catch (e) {
          const reason = e instanceof Error ? e.message : "erro desconhecido ao processar foto";
          failures.push({ filename: photo.filename ?? "(sem filename)", reason });
          skipped++;
        }
      }

      try {
        await batch.commit();
        imported += chunkImported.length;
      } catch (e) {
        // Entire batch failed — mark all staged photos as failed
        const reason = e instanceof Error ? e.message : "falha no commit do batch";
        const batchStart = i;
        for (let j = 0; j < chunkImported.length; j++) {
          const photo = chunk[j];
          failures.push({ filename: photo.filename ?? "(sem filename)", reason: `batch ${Math.floor(batchStart / CHUNK) + 1} falhou: ${reason}` });
        }
        skipped += chunkImported.length;
      }
    }

    return NextResponse.json({
      total:    photos.length,
      imported,
      skipped,
      failures: failures.length ? failures : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/photos/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
