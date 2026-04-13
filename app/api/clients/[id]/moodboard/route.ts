import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { uploadToR2 } from "@/lib/r2";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

export const maxDuration = 60;

// ── Anthropic client ──────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── GET — list all moodboard items for a client ───────────────────────────────
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
      .collection("clients")
      .doc(client_id)
      .collection("moodboard")
      .orderBy("created_at", "desc")
      .limit(30)
      .get();

    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/moodboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST — upload image + Claude Vision analysis ──────────────────────────────
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

    // ── Upload to R2 ──────────────────────────────────────────────────────────
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const uuid = randomUUID();
    const r2_key = `moodboard/${client_id}/${uuid}.${ext}`;

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";

    const url = await uploadToR2(r2_key, rawBuffer, contentType);

    // ── Claude Vision analysis ────────────────────────────────────────────────
    type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const mediaType = (contentType.split(";")[0].trim()) as MediaType;
    const base64 = rawBuffer.toString("base64");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: "text",
              text: `Analise esta imagem de moodboard e retorne um JSON com os seguintes campos:

- style_notes: descrição do estilo artístico, mood e atmosfera visual da imagem (pode ser em pt-BR)
- composition_notes: descrição do layout, zonas de interesse, uso de espaço negativo e hierarquia visual (pode ser em pt-BR)
- color_palette: array com até 5 cores dominantes no formato hex (ex: ["#1A1A2E", "#E94560"])
- inspiration_tags: array com tags em inglês que descrevem o estilo visual (ex: ["minimal", "editorial", "luxury", "warm", "bold", "dark", "geometric", "organic", "typographic", "photographic"])
- applies_to_pillar: array com os pilares de conteúdo aos quais este estilo visual se aplica (use: ["Produto", "Educação", "Institucional", "Bastidores", "Engajamento", "Promoção"])

Retorne APENAS o JSON puro, sem markdown fences ou texto adicional.`,
            },
          ],
        },
      ],
    });

    // ── Parse Claude response ─────────────────────────────────────────────────
    const rawText = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    const stripped = rawText
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    let analysis: {
      style_notes: string;
      composition_notes: string;
      color_palette: string[];
      inspiration_tags: string[];
      applies_to_pillar: string[];
    };

    try {
      analysis = JSON.parse(stripped);
    } catch {
      // Fallback: try to extract JSON object from the text
      const first = stripped.indexOf("{");
      const last  = stripped.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try {
          analysis = JSON.parse(stripped.slice(first, last + 1));
        } catch {
          console.error("[POST /api/clients/[id]/moodboard] JSON inválido:", stripped.slice(0, 400));
          return NextResponse.json({ error: "Análise retornou JSON inválido. Tente novamente." }, { status: 500 });
        }
      } else {
        console.error("[POST /api/clients/[id]/moodboard] JSON inválido:", stripped.slice(0, 400));
        return NextResponse.json({ error: "Análise retornou JSON inválido. Tente novamente." }, { status: 500 });
      }
    }

    // ── Save to Firestore ─────────────────────────────────────────────────────
    const ref = adminDb
      .collection("clients")
      .doc(client_id)
      .collection("moodboard")
      .doc();

    const item = {
      id:                ref.id,
      agency_id:         user.uid,
      client_id,
      r2_key,
      url,
      filename:          file.name,
      style_notes:       analysis.style_notes       ?? "",
      composition_notes: analysis.composition_notes ?? "",
      color_palette:     Array.isArray(analysis.color_palette)    ? analysis.color_palette    : [],
      inspiration_tags:  Array.isArray(analysis.inspiration_tags) ? analysis.inspiration_tags : [],
      applies_to_pillar: Array.isArray(analysis.applies_to_pillar)? analysis.applies_to_pillar: [],
      created_at:        FieldValue.serverTimestamp(),
    };

    await ref.set(item);

    return NextResponse.json(item, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/moodboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
