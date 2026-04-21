import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { PhaseId } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ flowId: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { flowId } = await params;

  // flowId "new" or "new-{clientId}" — canvas not yet persisted
  if (flowId === "new" || flowId.startsWith("new-")) {
    console.log("[GET canvas] flowId is 'new' — returning empty", { flowId });
    return NextResponse.json({ flow: null, phases: {} });
  }

  const parts    = flowId.split("_");
  const clientId = parts.length > 1 ? parts[0] : null;
  if (!clientId) {
    console.log("[GET canvas] could not parse clientId from flowId", { flowId });
    return NextResponse.json({ flow: null, phases: {} });
  }

  const realFlowId  = parts.slice(1).join("_");
  const flowDocPath = paths.flow(user.uid, clientId, realFlowId);
  console.log("[GET canvas] loading flow", { flowDocPath });

  const snap = await adminDb.doc(flowDocPath).get();
  if (!snap.exists) {
    console.log("[GET canvas] flow doc not found", { flowDocPath });
    return NextResponse.json({ flow: null, phases: {} });
  }

  const flowData    = snap.data()!;
  const latestRunId = flowData.latestRunId as string | undefined;
  console.log("[GET canvas] flow found", { latestRunId: latestRunId ?? null });

  let phases: Record<string, unknown> = {};
  if (latestRunId) {
    const phaseRunsPath = paths.phaseRuns(user.uid, clientId, latestRunId);
    console.log("[GET canvas] loading phaseRuns", { phaseRunsPath });

    const phaseRunsSnap = await adminDb.collection(phaseRunsPath).get();
    const allDocs       = phaseRunsSnap.docs.map(d => d.data());
    console.log("[GET canvas] phaseRuns total", { total: allDocs.length, statuses: allDocs.map(d => d.status) });

    const doneDocs = allDocs
      .filter(d => d.status === "done")
      .sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));

    for (const doc of doneDocs) {
      const pid = doc.phaseId as PhaseId;
      if (pid) phases[pid] = { status: "done", output: doc.output ?? {} };
    }
    console.log("[GET canvas] hydration phases", { phaseIds: Object.keys(phases) });

    const traces: import("@/types").CanvasTraceEntry[] = [];
    for (const doc of doneDocs) {
      const pid = doc.phaseId as PhaseId;
      if (!pid) continue;
      if (doc.traces && Array.isArray(doc.traces)) {
        for (const t of doc.traces as import("@/types").TraceEntry[]) {
          traces.push({ ...t, phaseId: pid });
        }
      }
    }

    return NextResponse.json({ flow: { id: snap.id, ...flowData }, phases, traces });
  }

  return NextResponse.json({ flow: { id: snap.id, ...flowData }, phases, traces: [] });
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
