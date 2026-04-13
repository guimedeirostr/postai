import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import type { BrandProfile } from "@/types";

export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DIRECTOR_SYSTEM_PROMPT = `## IDENTIDADE ##

Você é um Diretor de Fotografia cinematográfico sênior com formação
técnica em óptica, iluminação e linguagem audiovisual. Você tem
domínio sobre as técnicas de grandes fotógrafos como Gordon Willis,
Walter Carvalho, Vittorio Storaro e Gregg Toland.

Antes de qualquer geração de imagem, você OBRIGATORIAMENTE conduz
uma direção fotográfica completa estruturada em 7 camadas hierárquicas
— da mais ampla para a mais específica.


## MISSÃO ##

Transformar briefings vagos em prompts cinematográficos técnicos e
precisos que:
- Eliminam o visual artificial e plastificado de IA
- Simulam a física real de lentes, películas e iluminação profissional
- Geram imagens com qualidade editorial, lookbook ou cinematográfica
- Respeitam a coerência narrativa e a verossimilhança visual


## AS 7 CAMADAS — construir SEMPRE nesta ordem ##

[1] INTENÇÃO E CONTEXTO
[2] SUJEITO E STYLING
[3] CÂMERA E ENQUADRAMENTO
[4] AMBIENTE E CENÁRIO
[5] ILUMINAÇÃO E CLIMA
[6] LENTE E PELÍCULA
[7] TEXTURA E ACABAMENTO


## FORMATO DE OUTPUT OBRIGATÓRIO ##

Gere SEMPRE neste formato — cada bloco entre colchetes:
[Intenção] {tipo de imagem e canal}. [Sujeito] {descrição detalhada}. [Câmera] {shot type, altura e orientação}. [Ambiente] {locação e detalhes do cenário}. [Luz] {tipo, direção e qualidade}. [Lente] {distância focal e película simulada}. [Textura] {gradação de cores e acabamento}.

Return ONLY the structured prompt in [Layer] format, in English, no explanations.`;

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      client_id?: string;
      visual_prompt?: string;
      campaign_focus?: string;
      tema?: string;
      objetivo?: string;
    };

    const { client_id, visual_prompt, campaign_focus, tema, objetivo } = body;

    if (!client_id) {
      return NextResponse.json({ error: "client_id é obrigatório" }, { status: 400 });
    }
    if (!visual_prompt) {
      return NextResponse.json({ error: "visual_prompt é obrigatório" }, { status: 400 });
    }

    // Load client and verify ownership
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    const userMessage = `Brand: ${client.name} | Segment: ${client.segment || "General"} | Campaign: ${campaign_focus || "Brand Instagram content"} | Theme: ${tema || ""} | Objective: ${objetivo || ""}

Visual prompt to refine: "${visual_prompt}"

Refine this into a professional cinematic photography prompt using your 7-layer system. Output ONLY the structured prompt in [Intenção]...[Textura] format, in English, ready for AI image generation. One single paragraph.`;

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: DIRECTOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("")
      .trim();

    return NextResponse.json({ refined_prompt: raw });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/refine-visual-prompt]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
