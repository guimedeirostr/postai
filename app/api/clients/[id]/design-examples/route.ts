import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { Query } from "firebase-admin/firestore";
import type { DesignExample } from "@/types";

// ─── GET /api/clients/[id]/design-examples ────────────────────────────────────
// Returns all design examples for a client, optionally filtered by pilar/format.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;
    const { searchParams }  = req.nextUrl;
    const pilar  = searchParams.get("pilar")  ?? undefined;
    const format = searchParams.get("format") ?? undefined;

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    let query = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples")
      .orderBy("created_at", "desc") as Query;

    if (pilar)  query = query.where("pilar",  "==", pilar);
    if (format) query = query.where("format", "==", format);

    const snap = await query.get();
    const examples = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ examples, total: examples.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/design-examples]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── POST /api/clients/[id]/design-examples ───────────────────────────────────
// Manually create a single design example (e.g. promote an approved post).
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

    const body = await req.json() as Partial<DesignExample>;

    if (!body.visual_prompt || !body.layout_prompt || !body.pilar || !body.format) {
      return NextResponse.json(
        { error: "visual_prompt, layout_prompt, pilar e format são obrigatórios" },
        { status: 400 }
      );
    }

    const ref = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples").doc();

    await ref.set({
      id:                    ref.id,
      agency_id:             user.uid,
      client_id,
      visual_prompt:         body.visual_prompt,
      layout_prompt:         body.layout_prompt,
      visual_headline_style: body.visual_headline_style ?? "",
      pilar:                 body.pilar,
      format:                body.format,
      description:           body.description ?? "",
      color_mood:            body.color_mood ?? "",
      composition_zone:      body.composition_zone ?? "bottom",
      source_url:            body.source_url ?? null,
      image_url:             body.image_url ?? null,
      created_at:            FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/design-examples]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
