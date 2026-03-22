import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

async function getClientOrFail(id: string, agencyId: string) {
  const doc = await adminDb.collection("clients").doc(id).get();
  if (!doc.exists || doc.data()?.agency_id !== agencyId) return null;
  return doc;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await getClientOrFail(id, user.uid);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const allowed = [
    "name", "logo_url", "primary_color", "secondary_color",
    "segment", "target_audience", "tone_of_voice",
    "instagram_handle", "bio", "keywords", "avoid_words",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  await doc.ref.update(update);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const doc = await getClientOrFail(id, user.uid);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await doc.ref.delete();
  return NextResponse.json({ ok: true });
}
