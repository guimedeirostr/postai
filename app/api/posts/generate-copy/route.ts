import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildCopyPrompt } from "@/lib/prompts/copy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import { SKILLS_BETA, CONTAINER_INSTAGRAM } from "@/lib/skills";
import type { BrandProfile, StrategyContext } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL     = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

interface CopyResult {
  visual_headline: string;
  headline:        string;
  caption:         string;
  hashtags:        string[];
  visual_prompt:   string;
  layout_prompt:   string;
  framework_used:  string;
  hook_type:       string;
}

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

    const {
      client_id,
      theme,
      objective,
      format,
      pilar,
      publico_especifico,
      dor_desejo,
      hook_type,
    } = await req.json() as {
      client_id: string;
      theme: string;
      objective: string;
      format: string;
      pilar?: string;
      publico_especifico?: string;
      dor_desejo?: string;
      hook_type?: string;
    };

    if (!client_id || !theme || !objective || !format) {
      return NextResponse.json({ error: "client_id, theme, objective e format são obrigatórios" }, { status: 400 });
    }

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    const strategy: StrategyContext = {};
    if (pilar)             strategy.pilar             = pilar;
    if (publico_especifico) strategy.publico_especifico = publico_especifico;
    if (dor_desejo)        strategy.dor_desejo        = dor_desejo;
    if (hook_type)         strategy.hook_type         = hook_type;

    const response = await anthropic.beta.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      betas:      [SKILLS_BETA],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      container:  CONTAINER_INSTAGRAM as any,
      system:     buildCopyPrompt(client, format, objective, Object.keys(strategy).length ? strategy : undefined),
      messages: [{
        role:    "user",
        content: `Tema: ${theme}\nObjetivo: ${objective}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`,
      }],
    });

    // Busca o primeiro bloco de texto (pode haver tool_use antes em respostas beta)
    const textBlock = response.content.find(b => b.type === "text");
    const raw       = textBlock?.type === "text" ? textBlock.text : "";
    const cleaned   = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let copy: CopyResult;
    try {
      copy = JSON.parse(cleaned) as CopyResult;
    } catch {
      return NextResponse.json({ error: "Falha ao parsear resposta da IA", raw }, { status: 500 });
    }

    const ref = adminDb.collection("posts").doc();
    await ref.set({
      id:              ref.id,
      agency_id:       user.uid,
      client_id,
      client_name:     client.name,
      theme,
      objective,
      format,
      visual_headline: copy.visual_headline,
      headline:        copy.headline,
      caption:         copy.caption,
      hashtags:        copy.hashtags,
      visual_prompt:   copy.visual_prompt,
      layout_prompt:   copy.layout_prompt ?? null,
      framework_used:  copy.framework_used,
      hook_type:       copy.hook_type,
      image_url:       null,
      status:          "ready",
      created_at:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ post_id: ref.id, ...copy });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-copy]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
