import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snap = await adminDb
      .collection("clients")
      .where("agency_id", "==", user.uid)
      .get();

    const clients = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => {
        const aTime = (a.created_at as { _seconds?: number })?._seconds ?? 0;
        const bTime = (b.created_at as { _seconds?: number })?._seconds ?? 0;
        return bTime - aTime;
      });

    return NextResponse.json({ clients });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const ref = adminDb.collection("clients").doc();
    await ref.set({
      id: ref.id,
      agency_id: user.uid,
      name:             body.name             ?? "",
      logo_url:         body.logo_url         ?? null,
      primary_color:    body.primary_color    ?? "#6d28d9",
      secondary_color:  body.secondary_color  ?? "#4f46e5",
      segment:          body.segment          ?? "",
      target_audience:  body.target_audience  ?? "",
      tone_of_voice:    body.tone_of_voice    ?? "",
      instagram_handle: body.instagram_handle ?? "",
      bio:              body.bio              ?? "",
      keywords:         body.keywords         ?? [],
      avoid_words:      body.avoid_words      ?? [],
      created_at:       FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
