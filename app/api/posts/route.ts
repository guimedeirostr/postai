import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const client_id = req.nextUrl.searchParams.get("client_id");

    let snap;
    if (client_id) {
      snap = await adminDb.collection("posts")
        .where("agency_id", "==", user.uid)
        .where("client_id", "==", client_id)
        .get();
    } else {
      snap = await adminDb.collection("posts")
        .where("agency_id", "==", user.uid)
        .get();
    }

    const posts = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
      .sort((a, b) => {
        const aTime = (a.created_at as { _seconds?: number })?._seconds ?? 0;
        const bTime = (b.created_at as { _seconds?: number })?._seconds ?? 0;
        return bTime - aTime;
      })
      .slice(0, 100);

    return NextResponse.json({ posts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/posts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
