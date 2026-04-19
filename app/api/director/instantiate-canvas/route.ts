import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import type { PlanoDePost } from "@/types";

const ROW_H   = 320;
const SLIDE_W = 840;
const COPY_DY = 180;

function buildCanvas(plan: PlanoDePost, clientId: string) {
  const slides  = plan.slidesBriefing ?? [];
  const N       = Math.max(slides.length, 1);
  const totalH  = N * ROW_H;
  const centerY = totalH / 2 - ROW_H / 2;

  type RFNode = { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
  type RFEdge = { id: string; source: string; target: string; type: string; animated: boolean };

  const nodes: RFNode[] = [];
  const edges: RFEdge[] = [];

  // ── Left column: Briefing + Memory ───────────────────────────────────────────
  nodes.push({
    id:   "briefing-1",
    type: "briefing",
    position: { x: 40, y: centerY - 130 },
    data: { clientId, objetivo: "", formato: "carousel" },
  });
  nodes.push({
    id:   "memory-1",
    type: "clientMemory",
    position: { x: 40, y: centerY + 130 },
    data: {},
  });

  // ── Plan node ─────────────────────────────────────────────────────────────────
  nodes.push({
    id:   "plan-1",
    type: "plan",
    position: { x: 420, y: centerY - 40 },
    data: { plan, clientId, status: "done" },
  });

  edges.push(
    { id: "e-b-p", source: "briefing-1", target: "plan-1",    type: "glow", animated: true  },
    { id: "e-m-p", source: "memory-1",   target: "plan-1",    type: "glow", animated: false },
  );

  // ── Per-slide nodes ───────────────────────────────────────────────────────────
  slides.forEach((s) => {
    const y        = (s.n - 1) * ROW_H + 20;
    const promptId = `prompt-${s.n}`;
    const copyId   = `copy-${s.n}`;

    nodes.push({
      id:   promptId,
      type: "prompt",
      position: { x: SLIDE_W, y },
      data: { slideN: s.n, prompt: s.visual, status: "idle" },
    });
    nodes.push({
      id:   copyId,
      type: "copy",
      position: { x: SLIDE_W, y: y + COPY_DY },
      data: { headline: s.copy, status: "idle" },
    });

    edges.push(
      { id: `e-p-pr-${s.n}`,   source: "plan-1",   target: promptId,   type: "glow", animated: true  },
      { id: `e-p-cp-${s.n}`,   source: "plan-1",   target: copyId,     type: "glow", animated: true  },
      { id: `e-pr-cr-${s.n}`,  source: promptId,   target: "critic-1", type: "glow", animated: false },
      { id: `e-cp-cr-${s.n}`,  source: copyId,     target: "critic-1", type: "glow", animated: false },
    );
  });

  // ── Critic + Output ───────────────────────────────────────────────────────────
  nodes.push({
    id:   "critic-1",
    type: "critic",
    position: { x: 1220, y: centerY - 40 },
    data: { status: "idle" },
  });
  nodes.push({
    id:   "output-1",
    type: "output",
    position: { x: 1580, y: centerY - 40 },
    data: { status: "idle" },
  });
  edges.push({ id: "e-cr-out", source: "critic-1", target: "output-1", type: "glow", animated: false });

  return { nodes, edges };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: { plan: PlanoDePost; clientId: string; flowTitle?: string } = await req.json();
    const { plan, clientId, flowTitle } = body;

    if (!clientId || !plan) {
      return NextResponse.json({ error: "clientId e plan são obrigatórios" }, { status: 400 });
    }

    const { nodes, edges } = buildCanvas(plan, clientId);

    const flowRef = adminDb.collection(paths.flows(user.uid, clientId)).doc();
    await flowRef.set({
      clientId,
      title:     flowTitle ?? `Post — ${plan.bigIdea.slice(0, 50)}`,
      nodes,
      edges,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // flowId encoding: "{clientId}_{realFlowId}" so the canvas route can parse it
    const flowId = `${clientId}_${flowRef.id}`;
    return NextResponse.json({ flowId, nodes, edges });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[director/instantiate-canvas]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
