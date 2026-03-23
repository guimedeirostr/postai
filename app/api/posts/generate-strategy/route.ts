import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import type { BrandProfile, StrategyBriefing } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

function buildStrategyPrompt(client: BrandProfile, campaign_focus?: string): string {
  const dayOfWeek = new Date().toLocaleDateString("pt-BR", { weekday: "long" });

  return `Você é um estrategista sênior de conteúdo para Instagram, especializado no mercado brasileiro, com 10+ anos de experiência construindo autoridade e conversão para marcas nas redes sociais.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DA MARCA — ${client.name.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Segmento:       ${client.segment}
Público-alvo:   ${client.target_audience}
Tom de voz:     ${client.tone_of_voice}
${client.bio ? `Bio/Sobre:      ${client.bio}` : ""}
${client.keywords.length ? `Keywords:       ${client.keywords.join(", ")}` : ""}
Instagram:      ${client.instagram_handle || "não informado"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO TEMPORAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hoje é ${dayOfWeek}. Use isso para calibrar o pilar e o tom — segundas pedem motivação, sextas pedem leveza, fins de semana pedem engajamento pessoal, etc.
${campaign_focus ? `\nFoco de campanha indicado pelo usuário: "${campaign_focus}"` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
PILARES DE CONTEÚDO DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Produto: mostrar produto/serviço em uso, benefícios tangíveis
- Educação: ensinar algo valioso relacionado ao segmento
- Prova Social: depoimentos, resultados, cases, números
- Bastidores: humanizar a marca, processo, equipe
- Engajamento: perguntas, polls, interação, comunidade
- Promoção: ofertas, urgência, conversão direta
- Trend: aproveitar tendência cultural/comportamental atual

━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUA MISSÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Analise o perfil da marca, o contexto temporal e o eventual foco de campanha. Selecione o pilar e tema mais estratégico para HOJE. Pense como um CMO que quer maximizar engajamento E conversão com um único post.

Retorne APENAS JSON válido (sem markdown, sem explicações, sem texto fora do JSON):

{
  "pilar": "Produto|Educação|Prova Social|Bastidores|Engajamento|Promoção|Trend",
  "tema": "tema específico e concreto sugerido — 1 frase clara",
  "objetivo": "objetivo claro de conversão/engajamento — 1 frase com verbo de ação",
  "publico_especifico": "segmento específico do público para esta postagem",
  "dor_desejo": "dor ou desejo específico a explorar — seja cirúrgico",
  "formato_sugerido": "feed|stories|reels_cover",
  "hook_type": "Dor|Curiosidade|Pergunta|Prova Social|Controvérsia|Número",
  "rationale": "Por que esta estratégia agora — 1-2 frases conectando o contexto temporal, o perfil da marca e o objetivo"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     buildStrategyPrompt(client, campaign_focus),
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
