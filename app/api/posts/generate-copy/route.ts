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
      reference_image_base64,
      reference_image_type,
      image_provider,
      extra_instructions,
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
      reference_image_base64?: string;
      reference_image_type?: string;
      image_provider?: string;
      extra_instructions?: string;
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
    let referenceWarning: string | null = null;

    if (reference_image_base64) {
      // Upload direto do browser — caminho preferido, sem fetch externo
      referenceImageBase64 = reference_image_base64;
      const mt = reference_image_type ?? "image/jpeg";
      referenceMediaType   = mt as typeof referenceMediaType;
    } else if (reference_url) {
      // URL — funciona para imagens diretas; Instagram bloqueia server-side
      if (/instagram\.com/.test(reference_url)) {
        referenceWarning = "URLs do Instagram bloqueiam acesso server-side — a referência não foi carregada. Use o upload de imagem.";
      } else {
        try {
          const imgRes = await fetch(reference_url, { signal: AbortSignal.timeout(12_000) });
          if (imgRes.ok) {
            const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
            referenceMediaType   = (ct.split(";")[0].trim()) as typeof referenceMediaType;
            const buf            = await imgRes.arrayBuffer();
            referenceImageBase64 = Buffer.from(buf).toString("base64");
          } else {
            referenceWarning = `Não foi possível carregar a imagem de referência (HTTP ${imgRes.status}) — post gerado sem ela.`;
          }
        } catch {
          referenceWarning = "Erro ao carregar imagem de referência — post gerado sem ela.";
        }
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
            text: `REFERÊNCIA VISUAL PRIORITÁRIA: A imagem acima define o estilo visual deste post.\n\nSua tarefa:\n1. Analise profundamente: paleta de cores, estilo fotográfico, composição, mood, tipografia, atmosfera.\n2. Crie o visual_prompt replicando FIELMENTE esse estilo e paleta — NÃO use as cores da marca na imagem.\n3. Crie o layout_prompt baseado na composição e posicionamento de texto da referência.\n4. A identidade da marca aparece APENAS no copy (visual_headline, legenda) e nos overlays de texto — nunca na paleta da imagem.\n\nTema: ${theme}\nObjetivo: ${objective}${extra_instructions ? `\n\n⚡ INSTRUÇÕES ADICIONAIS DO USUÁRIO (prioridade máxima — siga à risca):\n${extra_instructions}` : ""}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`,
          },
        ]
      : `Tema: ${theme}\nObjetivo: ${objective}${extra_instructions ? `\n\n⚡ INSTRUÇÕES ADICIONAIS DO USUÁRIO (prioridade máxima — siga à risca):\n${extra_instructions}` : ""}\n\nEscreva o melhor post possível para este cliente seguindo o framework selecionado.`;

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     buildCopyPrompt(client, format, objective, Object.keys(strategy).length ? strategy : undefined, undefined, !!referenceImageBase64),
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
      image_provider:  image_provider ?? "mystic",
      status:          "ready",
      created_at:      FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      post_id: ref.id,
      ...copy,
      ...(referenceWarning ? { reference_warning: referenceWarning } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/posts/generate-copy]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
