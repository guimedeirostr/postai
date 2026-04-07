/**
 * POST /api/posts/analyze-reference
 *
 * Recebe uma imagem de referência (base64) e extrai o DNA visual completo
 * usando Claude Vision. Retorna um ReferenceDNA estruturado que alimenta
 * todo o pipeline de geração: Copy → Art Director → Compositor.
 *
 * Este é o Stage 0 do novo fluxo por etapas — o usuário sobe uma arte que
 * quer "copiar o estilo" e o sistema lê o DNA exato dela antes de qualquer
 * geração de conteúdo.
 *
 * Body: { image_base64: string, image_mime?: string }
 * Response: ReferenceDNA
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/session";
import { buildReferenceDNAPrompt } from "@/lib/prompts/design-example-analysis";
import type { ReferenceDNA } from "@/types";

// Claude Vision pode levar 20-40s — sem maxDuration default é 10s (504 no Vercel)
export const maxDuration = 60;

// Visão requer Sonnet — Haiku não suporta imagens
const VISION_MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { image_base64, image_mime } = await req.json() as {
      image_base64: string;
      image_mime?:  string;
    };

    if (!image_base64) {
      return NextResponse.json({ error: "image_base64 é obrigatório" }, { status: 400 });
    }

    const mediaType = (image_mime ?? "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/webp"
      | "image/gif";

    const response = await anthropic.messages.create({
      model:      VISION_MODEL,
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content: [
          {
            type:   "image",
            source: { type: "base64", media_type: mediaType, data: image_base64 },
          },
          { type: "text", text: buildReferenceDNAPrompt() },
        ],
      }],
    });

    const raw = response.content[0].type === "text" ? response.content[0].text : "";

    let dna: ReferenceDNA;
    try {
      dna = parseJson<ReferenceDNA>(raw);
    } catch {
      return NextResponse.json(
        { error: "Falha ao parsear DNA da referência", raw },
        { status: 500 }
      );
    }

    return NextResponse.json(dna);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/analyze-reference]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
