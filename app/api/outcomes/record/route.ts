/**
 * POST /api/outcomes/record
 * Registers a PromptOutcome (approved/rejected/regenerated) and updates slotWeights.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { recordOutcome } from "@/lib/ai/outcome";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      clientId:        string;
      compiledPromptId: string;
      slideId:         string;
      slotsSnapshot:   unknown[];
      criticScore:     number;
      humanDecision:   "approved" | "rejected" | "regenerated";
      humanReason?:    string;
    };

    const { clientId, compiledPromptId, slideId, slotsSnapshot, criticScore, humanDecision, humanReason } = body;

    if (!clientId || !slideId || !humanDecision) {
      return NextResponse.json({ error: "clientId, slideId e humanDecision são obrigatórios" }, { status: 400 });
    }

    const id = await recordOutcome(user.uid, clientId, {
      compiledPromptId: compiledPromptId ?? "",
      clientId,
      slideId,
      slotsSnapshot:    slotsSnapshot as import("@/types").LegacyPromptSlot[],
      criticScore:      criticScore ?? 0,
      humanDecision,
      humanReason,
    });

    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/outcomes/record]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
