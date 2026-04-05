import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildCopyPrompt } from "@/lib/prompts/copy";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import type { BrandProfile, StrategyContext } from "@/types";

export const maxDuration = 60;

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
      reference_url,
    } = await req.json() as {
      client_id: string;
      theme: string;
      objective: string;
      format: string;
      pilar?: string;
      publico_especifico?: string;
      dor_desejo?: string;
      hook_type?: string;
      reference_url?: string;
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

    // ── Resolver imagem de referência (se fornecida) ──────────────────────────
    let referenceImageBase64: string | null = null;
    let referenceMediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" = "image/jpeg";

    if (reference_url) {
      try {
        let imageUrl = reference_url;

        // Se for URL de post Instagram, extrai og:image
        if (/instagram\.com\/(p|reel|tv)\//.test(reference_url)) {
          const pageRes = await fetch(reference_url, {
            headers: { "User-Agent": "facebookexternalhit/1.1" },
            signal: AbortSignal.timeout(10_000),
            redirect: "follow",
          });
          if (pageRes.ok) {
            const html  = await pageRes.text();
            const match = html.match(/<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/i)
                       ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property="og:image"|name="twitter:image")/i);
            if (match?.[1]) imageUrl = match[1].replace(/&amp;/g, "&");
          }
        }

        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(12_000) });
        if (imgRes.ok) {
          const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
          referenceMediaType = (ct.split(";")[0].trim()) as typeof referenceMediaType;
          const buf = await imgRes.arrayBuffer();
          referenceImageBase64 = Buffer.from(buf).toString("base64");
        }
      } catch {
        // non-fatal — segue sem referência
      }
    }

    const userContent: Anthropic.MessageParam["content"] = referenceImageBase64
      ? [
          {
            type: "image",
            source: { type: "base64", media_type: referenceMediaType, data: referenceImageBase64 },
          },
          {
            type: "text",
            text: `REFERÊNCIA VISUAL: A imagem acima é um post que o usuário quer usar como inspiração visual.\nEstude o estilo, composição, mood de cores, posição do texto e atmosfera. Use isso como base para criar o visual_prompt e layout_prompt deste post — adaptando à identidade da marca, não copiando.\n\nTema: ${theme}\nObjetivo: ${objective}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`,
          },
        ]
      : `Tema: ${theme}\nObjetivo: ${objective}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`;

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     buildCopyPrompt(client, format, objective, Object.keys(strategy).length ? strategy : undefined),
      messages: [{ role: "user", content: userContent }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

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
      reference_url:   reference_url ?? null,
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
