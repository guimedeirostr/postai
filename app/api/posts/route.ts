import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client_id = req.nextUrl.searchParams.get("client_id");

  let query = adminDb.collection("posts")
    .where("agency_id", "==", user.uid)
    .orderBy("created_at", "desc")
    .limit(100);

  if (client_id) {
    query = adminDb.collection("posts")
      .where("agency_id", "==", user.uid)
      .where("client_id", "==", client_id)
      .orderBy("created_at", "desc")
      .limit(100);
  }

  const snap  = await query.get();
  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ posts });
}
