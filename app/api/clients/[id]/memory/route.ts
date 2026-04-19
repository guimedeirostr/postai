/**
 * GET  /api/clients/[id]/memory  — lê ClientMemory do cliente V3
 * PATCH /api/clients/[id]/memory — atualiza toneExamples / rejectedPatterns
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: clientId } = await params;

    // Verify ownership via legacy clients collection
    const clientDoc = await adminDb.collection("clients").doc(clientId).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const memSnap = await adminDb.doc(paths.memory(user.uid, clientId)).get();
    const memory  = memSnap.exists ? memSnap.data() : null;

    return NextResponse.json({ memory, clientId, clientName: clientDoc.data()?.name ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/clients/[id]/memory]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
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

    const body = await req.json() as {
      toneExamples?:     string[];
      rejectedPatterns?: { pattern: string; reason: string }[];
    };

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.toneExamples     !== undefined) updates.toneExamples     = body.toneExamples;
    if (body.rejectedPatterns !== undefined) updates.rejectedPatterns = body.rejectedPatterns;

    await adminDb.doc(paths.memory(user.uid, clientId)).set(updates, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[PATCH /api/clients/[id]/memory]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
