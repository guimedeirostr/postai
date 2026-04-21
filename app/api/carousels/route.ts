/**
 * GET /api/carousels?client_id=X
 *
 * Lista carrosseis da agência autenticada.
 * Filtra opcionalmente por client_id.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    // Accept both snake_case (legacy) and camelCase (canvas) param names
    const client_id = searchParams.get("client_id") ?? searchParams.get("clientId");

    console.log("[GET /api/carousels] query", { uid: user.uid, client_id });

    let query = adminDb.collection("carousels").where("agency_id", "==", user.uid) as FirebaseFirestore.Query;
    if (client_id) query = query.where("client_id", "==", client_id);

    const snap = await query.get();
    console.log("[GET /api/carousels] found", { total: snap.size, ids: snap.docs.map(d => d.id) });

    const carousels = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string,unknown>, b: Record<string,unknown>) => {
        const at = (a.created_at as { seconds?: number })?.seconds ?? 0;
        const bt = (b.created_at as { seconds?: number })?.seconds ?? 0;
        return bt - at;
      });

    return NextResponse.json({ carousels });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
