import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { buildCopyPrompt } from "@/lib/prompts/copy";
import { extractPromptFromImage } from "@/lib/freepik";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import type { BrandProfile, StrategyContext, ReferenceDNA, DesignExample } from "@/types";

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
      reference_dna: reference_dna_inline,
      reference_example_id,
      image_provider,
      extra_instructions,
      caption_suggestion,
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
      reference_dna?: ReferenceDNA;
      reference_example_id?: string;
      image_provider?: string;
      extra_instructions?: string;
      caption_suggestion?: string;
    };

    let reference_dna: ReferenceDNA | undefined = reference_dna_inline;

    if (!client_id || !theme || !objective || !format) {
      return NextResponse.json({ error: "client_id, theme, objective e format são obrigatórios" }, { status: 400 });
    }

    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const client = { id: clientDoc.id, ...clientDoc.data() } as BrandProfile;

    // ── Resolver reference_dna a partir de reference_example_id ──────────────
    // Permite escolher uma referência já salva na biblioteca sem re-uploadar.
    if (!reference_dna && reference_example_id) {
      try {
        const exDoc = await adminDb
          .collection("clients").doc(client_id)
          .collection("design_examples").doc(reference_example_id)
          .get();
        if (exDoc.exists) {
          const ex = exDoc.data() as DesignExample;
          if (ex.background_treatment || ex.headline_style || ex.text_zones) {
            reference_dna = {
              composition_zone:      ex.composition_zone,
              text_zones:            ex.text_zones ?? "",
              background_treatment:  ex.background_treatment ?? "",
              headline_style:        ex.headline_style ?? "",
              typography_hierarchy:  ex.typography_hierarchy ?? "",
              visual_prompt:         ex.visual_prompt,
              layout_prompt:         ex.layout_prompt,
              color_mood:            ex.color_mood,
              description:           ex.description,
              pilar:                 ex.pilar,
              format:                ex.format,
              visual_headline_style: ex.visual_headline_style,
              ...(ex.logo_placement ? { logo_placement: ex.logo_placement } : {}),
            };
          }
        }
      } catch (e) {
        console.warn("[generate-copy] Falha ao resolver reference_example_id (non-fatal):", e);
      }
    }

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

    // ── Freepik Image-to-Prompt (parallel with no blocking wait) ────────────
    let freepikExtractedPrompt: string | null = null;
    if (referenceImageBase64) {
      freepikExtractedPrompt = await extractPromptFromImage({
        imageBase64: referenceImageBase64,
        imageMime:   referenceMediaType,
      });
    }

    // ── Montar contexto de referência ─────────────────────────────────────────
    // Prioridade: reference_dna (extraído no Stage 0) > imagem bruta > nenhum

    let referenceTextBlock: string;
    let userContent: Anthropic.MessageParam["content"];

    if (reference_dna) {
      // Caminho preferido: DNA estruturado extraído pelo analyze-reference
      // Muito mais rico que enviar a imagem bruta — Claude tem hierarquia, zonas, etc.
      const dnaBlock = [
        `DNA VISUAL DA REFERÊNCIA — guia prioritário para este post:`,
        ``,
        `Zona de composição: ${reference_dna.composition_zone}`,
        `Zonas de texto: ${reference_dna.text_zones}`,
        `Tratamento de fundo: ${reference_dna.background_treatment}`,
        `Estilo do headline: ${reference_dna.headline_style}`,
        `Hierarquia tipográfica: ${reference_dna.typography_hierarchy}`,
        `Mood de cores: ${reference_dna.color_mood}`,
        `Pilar detectado: ${reference_dna.pilar}`,
        ``,
        `Visual prompt da referência (base para seu visual_prompt):`,
        `"${reference_dna.visual_prompt}"`,
        ``,
        `Layout prompt da referência (base para seu layout_prompt):`,
        `"${reference_dna.layout_prompt}"`,
        ``,
        `INSTRUÇÕES:`,
        `1. Use o visual_prompt da referência como base — adapte ao tema atual, mantendo paleta, estilo e atmosfera.`,
        `2. Use o layout_prompt da referência como base — mantenha a mesma zona de composição (${reference_dna.composition_zone}) e hierarquia tipográfica.`,
        `3. A identidade da marca (cores, logo) aparece APENAS nos overlays — nunca substitua a paleta da imagem pelas cores da marca.`,
        ``,
        `Tema: ${theme}`,
        `Objetivo: ${objective}`,
        caption_suggestion ? `\n💬 SUGESTÃO DE LEGENDA:\n"${caption_suggestion}"` : "",
        extra_instructions  ? `\n⚡ INSTRUÇÕES ADICIONAIS (prioridade máxima):\n${extra_instructions}` : "",
        ``,
        `Escreva o melhor post possível seguindo o framework selecionado.`,
      ].filter(Boolean).join("\n");

      referenceTextBlock = dnaBlock;
      userContent = dnaBlock;

    } else if (referenceImageBase64) {
      // Fallback: imagem bruta sem análise prévia (Stage 0 foi pulado)
      referenceTextBlock = [
        `REFERÊNCIA VISUAL PRIORITÁRIA: A imagem acima define o estilo visual deste post.`,
        freepikExtractedPrompt
          ? `\nPROMPT EXTRAÍDO PELO FREEPIK:\n"${freepikExtractedPrompt}"`
          : "",
        `\n\nSua tarefa:`,
        `1. Analise: paleta, estilo fotográfico, composição, mood, tipografia.`,
        `2. Crie o visual_prompt replicando FIELMENTE esse estilo.`,
        `3. Crie o layout_prompt baseado na composição da referência.`,
        `4. Marca aparece APENAS nos overlays — nunca na paleta da imagem.`,
        `\nTema: ${theme}\nObjetivo: ${objective}`,
        caption_suggestion ? `\n\n💬 SUGESTÃO DE LEGENDA:\n"${caption_suggestion}"` : "",
        extra_instructions  ? `\n\n⚡ INSTRUÇÕES ADICIONAIS:\n${extra_instructions}` : "",
        `\n\nEscreva o melhor post possível seguindo o framework selecionado.`,
      ].join("");

      userContent = [
        { type: "image", source: { type: "base64", media_type: referenceMediaType, data: referenceImageBase64 } },
        { type: "text", text: referenceTextBlock },
      ];

    } else {
      referenceTextBlock = [
        `Tema: ${theme}`,
        `Objetivo: ${objective}`,
        extra_instructions ? `\n\n⚡ INSTRUÇÕES ADICIONAIS:\n${extra_instructions}` : "",
        `\n\nEscreva o melhor post possível seguindo o framework selecionado.`,
      ].join("");

      userContent = referenceTextBlock;
    }

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 4096,
      system:     buildCopyPrompt(
        client,
        format,
        objective,
        Object.keys(strategy).length ? strategy : undefined,
        undefined,
        !!(referenceImageBase64 || reference_dna),
        reference_dna?.visual_prompt,   // lock visual style to reference DNA
      ),
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
