import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { flowId } = await params;

  // flowId pode ser "new-{clientId}" para fluxos ainda não persistidos
  if (flowId.startsWith("new-")) {
    return NextResponse.json({ flow: null });
  }

  // Busca o flow em qualquer cliente deste user (query em collection group)
  // Simplificado: o flowId inclui clientId no formato "{clientId}_{flowId}"
  const parts    = flowId.split("_");
  const clientId = parts.length > 1 ? parts[0] : null;

  if (!clientId) return NextResponse.json({ flow: null });

  const snap = await adminDb.doc(paths.flow(user.uid, clientId, parts.slice(1).join("_"))).get();
  if (!snap.exists) return NextResponse.json({ flow: null });
  return NextResponse.json({ flow: { id: snap.id, ...snap.data() } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { flowId } = await params;

  const body: { clientId: string; title?: string; nodes: unknown[]; edges: unknown[] } = await req.json();
  const { clientId, nodes, edges, title } = body;

  if (!clientId) return NextResponse.json({ error: "clientId obrigatório", code: "MISSING_CLIENT_ID" }, { status: 400 });

  // "new" or "new-{clientId}" → generate a fresh Firestore doc ID.
  // Any other shape: expect "{clientId}_{realFlowId}" — extract the part after the first "_".
  let realFlowId: string;
  if (flowId === "new" || flowId.startsWith("new-")) {
    realFlowId = adminDb.collection(paths.flows(user.uid, clientId)).doc().id;
  } else {
    realFlowId = flowId.split("_").slice(1).join("_");
  }

  if (!realFlowId) {
    return NextResponse.json(
      { error: "flowId inválido", code: "INVALID_FLOW_ID", details: `flowId recebido: "${flowId}"` },
      { status: 400 }
    );
  }

  try {
    await adminDb.doc(paths.flow(user.uid, clientId, realFlowId)).set({
      clientId,
      title: title ?? "Novo fluxo",
      nodes,
      edges,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/canvas/[flowId]] Firestore error", message);
    return NextResponse.json({ error: message, code: "FIRESTORE_ERROR" }, { status: 500 });
  }

  return NextResponse.json({ flowId: realFlowId });
}
