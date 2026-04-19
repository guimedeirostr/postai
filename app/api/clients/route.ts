import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";

function toInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const withContext = searchParams.get("withContext") === "1";

    const snap = await adminDb
      .collection("clients")
      .where("agency_id", "==", user.uid)
      .get();

    const raw = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => {
        const aTime = (a.created_at as { _seconds?: number })?._seconds ?? 0;
        const bTime = (b.created_at as { _seconds?: number })?._seconds ?? 0;
        return bTime - aTime;
      });

    if (!withContext) return NextResponse.json({ clients: raw });

    // Augment each client with DNA + post count for the canvas picker
    const augmented = await Promise.all(raw.map(async (c) => {
      const id = c.id as string;
      const name = (c.name as string) ?? "";

      const [dnaSnap, postCountSnap] = await Promise.all([
        adminDb.doc(`clients/${id}/brand_dna/current`).get(),
        adminDb.collection("posts").where("client_id", "==", id).count().get(),
      ]);

      const dna = dnaSnap.exists ? (dnaSnap.data() as { confidence_score?: number }) : null;
      const postCount = postCountSnap.data().count ?? 0;
      const createdAt = (c.created_at as { _seconds?: number })?._seconds ?? 0;

      return {
        id,
        name,
        initials: toInitials(name),
        hasDnaVisual: !!dna,
        dnaConfidence: dna?.confidence_score,
        lastUsedAt: createdAt,
        postCount,
      };
    }));

    return NextResponse.json({ clients: augmented });
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
