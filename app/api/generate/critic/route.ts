/**
 * POST /api/generate/critic
 *
 * GPT-4o vision: avalia uma imagem gerada contra o brief do slide.
 * Retorna score 0-10 + notas de melhoria.
 *
 * Body: { imageUrl, brief, clientId?, slideId?, postId?, flowNodeId? }
 * Response: { score: number, notes: string }
 *
 * Se slideId + postId forem informados, salva o resultado no slide.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";

export const maxDuration = 60;

const OPENAI_MODEL = "gpt-4o";

async function callGPT4oVision(imageUrl: string, brief: string): Promise<{ score: number; notes: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada");

  const systemPrompt = `Você é o Crítico de Arte do PostAI — um diretor de arte sênior que avalia imagens geradas para Instagram.

Avalie a imagem recebida em relação ao brief fornecido. Considere:
1. Alinhamento com o brief (objetivo, público, estilo visual)
2. Qualidade técnica (composição, iluminação, foco)
3. Impacto visual (scroll-stopping, memorabilidade)
4. Adequação à plataforma Instagram
5. Coerência de marca (se descrito no brief)

Retorne APENAS JSON válido:
{
  "score": <número 0-10, sendo 10 perfeito>,
  "notes": "<feedback construtivo em 1-2 frases em português-BR, focado no que melhorar>"
}

Score < 7 = imagem deve ser regenerada.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:      OPENAI_MODEL,
      max_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role:    "user",
          content: [
            { type: "text",      text: `Brief: ${brief}` },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`OpenAI vision error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw     = data.choices[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed  = JSON.parse(cleaned) as { score: number; notes: string };

  return {
    score: Math.min(10, Math.max(0, Number(parsed.score))),
    notes: parsed.notes ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      imageUrl:    string;
      brief:       string;
      clientId?:   string;
      postId?:     string;
      slideId?:    string;
      flowNodeId?: string;
    } = await req.json();

    const { imageUrl, brief, clientId, postId, slideId } = body;

    if (!imageUrl || !brief) {
      return NextResponse.json({ error: "imageUrl e brief são obrigatórios" }, { status: 400 });
    }

    const { score, notes } = await callGPT4oVision(imageUrl, brief);

    // Persist to slide if identifiable
    if (clientId && postId && slideId) {
      await adminDb
        .doc(`${paths.slides(user.uid, clientId, postId)}/${slideId}`)
        .set({ criticScore: score, criticNotes: notes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    return NextResponse.json({ score, notes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[generate/critic]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
