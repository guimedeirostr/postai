import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const uid = user.uid;

    const [clientsSnap, postsSnap, approvedSnap] = await Promise.all([
      adminDb.collection("clients").where("agency_id", "==", uid).count().get(),
      adminDb.collection("posts").where("agency_id", "==", uid).count().get(),
      adminDb.collection("posts")
        .where("agency_id", "==", uid)
        .where("status", "==", "approved")
        .count()
        .get(),
    ]);

    return NextResponse.json({
      clients:  clientsSnap.data().count,
      posts:    postsSnap.data().count,
      approved: approvedSnap.data().count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/stats/dashboard]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
