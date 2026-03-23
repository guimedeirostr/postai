import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

interface PhotoRecord {
  id: string;
  url: string;
  filename: string;
  category: string;
  tags: string[];
  description: string;
}

interface CurationResult {
  rankings: Array<{ index: number; score: number; reason: string }>;
  winner_index: number;
  curation_reason: string;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const {
      client_id,
      post_id,
      theme,
      objective,
      pilar,
      dor_desejo,
    } = await req.json() as {
      client_id: string;
      post_id: string;
      theme: string;
      objective: string;
      pilar?: string;
      dor_desejo?: string;
    };

    if (!client_id || !post_id || !theme || !objective) {
      return NextResponse.json(
        { error: "client_id, post_id, theme e objective são obrigatórios" },
        { status: 400 }
      );
    }

    // Verify client ownership
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // Verify post ownership
    const postDoc = await adminDb.collection("posts").doc(post_id).get();
    if (!postDoc.exists || postDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // Fetch client photos
    const photosSnap = await adminDb
      .collection("photos")
      .where("client_id", "==", client_id)
      .where("agency_id", "==", user.uid)
      .get();

    if (photosSnap.empty) {
      return NextResponse.json(
        { error: "Nenhuma foto encontrada para este cliente. Adicione fotos na biblioteca." },
        { status: 404 }
      );
    }

    const allPhotos = photosSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<PhotoRecord, "id">),
    })) as PhotoRecord[];

    // Limit to 5 for Vision efficiency
    const photos = allPhotos.slice(0, 5);

    // Build system context
    const contextText = [
      `Tema do post: ${theme}`,
      `Objetivo: ${objective}`,
      pilar      ? `Pilar de conteúdo: ${pilar}` : "",
      dor_desejo ? `Dor/Desejo explorado: ${dor_desejo}` : "",
    ].filter(Boolean).join("\n");

    // Build vision message — text + image blocks interleaved
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image"; source: { type: "url"; url: string } };

    const contentBlocks: ContentBlock[] = [
      {
        type: "text",
        text: `Você é um curador visual especialista em conteúdo para Instagram no mercado brasileiro.

Analise as ${photos.length} imagem(ns) abaixo e selecione a que MELHOR representa este contexto de post:

${contextText}

Critérios (por ordem de prioridade):
1. Relevância direta ao tema e objetivo
2. Impacto emocional e qualidade visual
3. Alinhamento com o pilar de conteúdo
4. Potencial de engajamento no Instagram

Retorne APENAS JSON válido (sem markdown):
{
  "rankings": [
    { "index": 0, "score": 9, "reason": "1 frase justificando a nota" }
  ],
  "winner_index": 0,
  "curation_reason": "Por que esta é a melhor escolha para este post — 1 frase direta"
}`,
      },
    ];

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      contentBlocks.push({
        type: "text",
        text: `Imagem ${i + 1} — Categoria: ${p.category} | Tags: ${(p.tags ?? []).join(", ")} | ${p.description || "Sem descrição"}`,
      });
      contentBlocks.push({
        type: "image",
        source: { type: "url", url: p.url },
      });
    }

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      messages:   [{ role: "user", content: contentBlocks }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let curation: CurationResult;
    try {
      curation = JSON.parse(cleaned) as CurationResult;
    } catch {
      return NextResponse.json({ error: "Falha ao parsear resposta da IA", raw }, { status: 500 });
    }

    const winnerIdx = curation.winner_index ?? 0;
    const winner    = photos[winnerIdx];

    if (!winner) {
      return NextResponse.json({ error: "Índice do vencedor inválido" }, { status: 500 });
    }

    // Persist selection to post
    await adminDb.collection("posts").doc(post_id).update({
      image_url:        winner.url,
      curated_photo_id: winner.id,
      curation_reason:  curation.curation_reason,
    });

    return NextResponse.json({
      image_url:       winner.url,
      photo_id:        winner.id,
      curation_reason: curation.curation_reason,
      rankings: curation.rankings.map((r, i) => ({
        ...r,
        photo: photos[i]
          ? { id: photos[i].id, url: photos[i].url, filename: photos[i].filename }
          : null,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/curate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
