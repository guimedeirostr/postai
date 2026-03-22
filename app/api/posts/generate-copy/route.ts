import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { BrandProfile } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

interface CopyResult {
  headline:      string;
  caption:       string;
  hashtags:      string[];
  visual_prompt: string;
}

function buildSystemPrompt(client: BrandProfile, format: string): string {
  const formatGuide = {
    feed:        "Feed do Instagram — post quadrado ou retrato. Legenda pode ser mais longa (até 2200 chars). Use storytelling.",
    stories:     "Stories do Instagram — vertical 9:16. Texto curto e direto. CTA claro no final.",
    reels_cover: "Capa de Reels — imagem chamativa. Headline impactante. Legenda curiosa que instiga o clique.",
  }[format] ?? "Feed do Instagram";

  return `Você é um especialista em copywriting para Instagram.

CLIENTE: ${client.name}
SEGMENTO: ${client.segment}
PÚBLICO-ALVO: ${client.target_audience}
TOM DE VOZ: ${client.tone_of_voice}
${client.bio ? `BIO DA MARCA: ${client.bio}` : ""}
${client.keywords.length ? `PALAVRAS-CHAVE (use sempre que possível): ${client.keywords.join(", ")}` : ""}
${client.avoid_words.length ? `PALAVRAS PROIBIDAS (NUNCA use): ${client.avoid_words.join(", ")}` : ""}
COR PRIMÁRIA DA MARCA: ${client.primary_color}
COR SECUNDÁRIA DA MARCA: ${client.secondary_color}
${client.instagram_handle ? `INSTAGRAM: ${client.instagram_handle}` : ""}

FORMATO: ${formatGuide}

Responda APENAS em JSON válido (sem markdown):
{
  "headline": "título impactante com no máximo 10 palavras",
  "caption": "legenda completa com emojis estratégicos e quebras de linha naturais",
  "hashtags": ["hashtag1sem#", "hashtag2sem#", ... exatamente 30 hashtags relevantes e variadas],
  "visual_prompt": "detailed image generation prompt in English describing scene, lighting, style, mood, and brand colors (${client.primary_color} and ${client.secondary_color})"
}`;
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { client_id, theme, objective, format } = await req.json();

  if (!client_id || !theme || !objective || !format) {
    return NextResponse.json({ error: "client_id, theme, objective e format são obrigatórios" }, { status: 400 });
  }

  // Busca brand profile
  const clientDoc = await adminDb.collection("clients").doc(client_id).get();
  if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

  // Chama Claude
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(client, format),
    messages: [{
      role: "user",
      content: `Tema do post: ${theme}\nObjetivo: ${objective}`,
    }],
  });

  const raw     = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let copy: CopyResult;
  try {
    copy = JSON.parse(cleaned) as CopyResult;
  } catch {
    return NextResponse.json({ error: "Falha ao parsear resposta da IA", raw }, { status: 500 });
  }

  // Salva no Firestore
  const ref = adminDb.collection("posts").doc();
  await ref.set({
    id:           ref.id,
    agency_id:    user.uid,
    client_id,
    client_name:  client.name,
    theme,
    objective,
    format,
    headline:     copy.headline,
    caption:      copy.caption,
    hashtags:     copy.hashtags,
    visual_prompt: copy.visual_prompt,
    image_url:    null,
    status:       "ready",
    created_at:   FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ post_id: ref.id, ...copy });
}
