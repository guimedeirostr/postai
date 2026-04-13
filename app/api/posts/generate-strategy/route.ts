import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { buildStrategyPrompt } from "@/lib/prompts/strategy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { readTrendCache, fetchTrendContext, fetchLinkedInTrendContext, writeTrendCache } from "@/lib/tavily";
import type { BrandProfile, StrategyBriefing, SocialNetwork } from "@/types";

// Extended Thinking usa Sonnet — raciocínio de mercado real, não padrão
const STRATEGY_MODEL  = "claude-sonnet-4-6";
const THINKING_BUDGET = 8000;

// Extended Thinking pode levar 20–30s
export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const body = await req.json() as { client_id?: string; campaign_focus?: string; social_network?: SocialNetwork };
    const { client_id, campaign_focus, social_network } = body;

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;
    const social  = social_network ?? "instagram";

    // Cache-first: lê tendências do cache do dia antes de chamar Tavily ao vivo
    const fetchFn = social === "linkedin" ? fetchLinkedInTrendContext : fetchTrendContext;
    const trendContext = await readTrendCache(client_id, social)
      .catch(() => null)
      .then(async cached => {
        if (cached) return cached;
        const live = await fetchFn(client.segment ?? "", campaign_focus).catch(() => null);
        if (live) await writeTrendCache(client_id, social, live, user.uid).catch(() => null);
        return live;
      });

    if (trendContext) {
      console.log(`[generate-strategy/${social}] Tendências injetadas: "${trendContext.query}"`);
    }

    // Extended Thinking: Claude raciocina antes de responder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (anthropic.messages.create as (params: any) => Promise<Anthropic.Message>)({
      model:      STRATEGY_MODEL,
      max_tokens: 16000,   // deve ser > budget_tokens
      thinking:   { type: "enabled", budget_tokens: THINKING_BUDGET },
      system:     buildStrategyPrompt(client, campaign_focus, trendContext, social),
      messages: [{
        role:    "user",
        content: "Gere o briefing estratégico para o próximo post deste cliente.",
      }],
    });

    // Com Extended Thinking, content[0] é um bloco "thinking" — extrai só o texto
    const raw = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("");
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
