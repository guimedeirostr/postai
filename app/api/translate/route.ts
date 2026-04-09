/**
 * POST /api/translate
 *
 * Traduz texto para inglês usando Claude Haiku.
 * Usado pelo modal de geração para permitir que o usuário edite o
 * visual_prompt em português e receba a versão em inglês para enviar
 * às APIs de imagem (Freepik, Replicate, etc.).
 *
 * Body: { text: string }
 * Retorna: { translated: string }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { text } = await req.json() as { text?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "text é obrigatório" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "ANTHROPIC_API_KEY não configurada" }, { status: 503 });

    const client = new Anthropic({ apiKey });

    const msg = await client.messages.create({
      model:      process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        "You are a professional translator specializing in visual/photography prompts for AI image generation.",
        "Translate the user's text to English.",
        "Rules:",
        "- Output ONLY the translated text, nothing else",
        "- Preserve technical photography/design terminology",
        "- Keep proper nouns and brand names unchanged",
        "- Maintain the same tone and detail level",
        "- Do NOT add explanations, quotes, or prefixes like 'Translation:'",
      ].join("\n"),
      messages: [{ role: "user", content: text.trim() }],
    });

    const translated = (msg.content[0] as { type: string; text: string }).text?.trim() ?? "";

    return NextResponse.json({ translated });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/translate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
