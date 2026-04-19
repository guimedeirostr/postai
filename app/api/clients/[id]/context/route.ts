import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import type { ClientContext } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: clientId } = await params;

    const clientDoc = await adminDb.collection("clients").doc(clientId).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const clientData = clientDoc.data()!;

    const [brandKitSnap, memorySnap, dnaSnap, postsSnap] = await Promise.all([
      adminDb.doc(paths.brandKit(user.uid, clientId)).get(),
      adminDb.doc(paths.memory(user.uid, clientId)).get(),
      adminDb.doc(`clients/${clientId}/brand_dna/current`).get(),
      adminDb.collection("posts")
        .where("client_id", "==", clientId)
        .where("status", "==", "approved")
        .orderBy("created_at", "desc")
        .limit(10)
        .get(),
    ]);

    const ctx: ClientContext = {
      clientId,
      clientName: clientData.name ?? "",
      brandKit:      brandKitSnap.exists ? (brandKitSnap.data() as ClientContext["brandKit"]) : undefined,
      clientMemory:  memorySnap.exists   ? (memorySnap.data()   as ClientContext["clientMemory"]) : undefined,
      dnaVisual:     dnaSnap.exists      ? (dnaSnap.data()      as ClientContext["dnaVisual"]) : undefined,
      recentApprovedPosts: postsSnap.docs.map(d => {
        const p = d.data();
        return { id: d.id, coverUrl: p.image_url ?? "", copy: p.caption ?? "" };
      }),
      loadedAt: Date.now(),
    };

    return NextResponse.json(ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/context]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
