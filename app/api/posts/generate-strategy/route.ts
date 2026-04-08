import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { fetchTrendContext } from "@/lib/tavily";
import type { BrandProfile, StrategyBriefing } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido. Redefine em ${rl.resetAt}.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } }
      );
    }

    const body = await req.json() as { client_id?: string; campaign_focus?: string };
    const { client_id, campaign_focus } = body;

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // Busca tendências em tempo real (não-bloqueante — falha silenciosamente)
    const trendContext = await fetchTrendContext(
      client.segment ?? "",
      campaign_focus,
    );
    if (trendContext) {
      console.log(`[generate-strategy] Tavily tendências injetadas: "${trendContext.query}"`);
    }

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     buildStrategyPrompt(client, campaign_focus, trendContext),
      messages: [{
        role:    "user",
        content: "Gere o briefing estratégico para o próximo post deste cliente.",
      }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let briefing: StrategyBriefing;
    try {
      briefing = JSON.parse(cleaned) as StrategyBriefing;
    } catch {
      return NextResponse.json({ error: "Falha ao parsear resposta da IA", raw }, { status: 500 });
    }

    return NextResponse.json(briefing);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-strategy]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
