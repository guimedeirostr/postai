/**
 * POST /api/carousels/generate
 *
 * Gera um carrossel editorial para Instagram.
 * 1. Claude (carrosselEditorial skill) → JSON de slides
 * 2. Salva no Firestore (coleção "carousels")
 * 3. Dispara Freepik para o slide hook (index 0)
 * 4. Retorna { carousel_id, task_id, slides }
 *
 * Body:
 *   client_id:          string
 *   theme:              string        — tema/assunto do carrossel
 *   objective:          string        — ex: "Educar", "Engajar", "Vender"
 *   slide_count:        number        — 3-20 (default: 7)
 *   dna_images?:         { b64: string; mime: string }[]  — slides do carrossel de referência (até 20)
 *   extra_instructions?: string
 *
 * Legado (ainda aceito):
 *   dna_image_base64?:  string
 *   dna_image_type?:    string
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import { checkRateLimit, AI_DAILY_LIMIT } from "@/lib/rate-limit";
import {
  createTask, createSeedreamTask, isSeedreamEnabled,
  freepikAspect, type FreepikGenerateParams,
} from "@/lib/freepik";
import { buildCarouselPrompt } from "@/lib/prompts/carousel";
import {
  ALL_SKILLS_BETAS, CONTAINER_CARROSSEL, SKILLS_MODEL, CODE_EXECUTION_TOOL,
} from "@/lib/skills";
import type { BrandProfile, CarouselSlide, GeneratedCarousel } from "@/types";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FALLBACK_MODEL  = process.env.ANTHROPIC_MODEL        ?? "claude-haiku-4-5-20251001";
// Quando há imagens de DNA, usa Sonnet (mais rápido que Opus com visão, evita timeout de 60s)
const VISION_MODEL    = process.env.CAROUSEL_VISION_MODEL  ?? "claude-sonnet-4-5-20251001";

interface CarouselJSON {
  topic:    string;
  caption:  string;
  hashtags: string[];
  slides:   CarouselSlide[];
}

async function callCarouselSkill(
  systemPrompt: string,
  userMessage: Anthropic.MessageParam["content"]
): Promise<string> {
  // Try with carrosselEditorial skill (claude-opus-4-5)
  try {
    const response = await (anthropic.beta.messages.create as Function)({
      model:      SKILLS_MODEL,
      max_tokens: 8192,
      betas:      ALL_SKILLS_BETAS,
      container:  CONTAINER_CARROSSEL,
      tools:      [CODE_EXECUTION_TOOL],
      system:     systemPrompt,
      messages:   [{ role: "user", content: userMessage }],
    });
    const text = (response.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === "text")
      .map(b => b.text ?? "")
      .join("");
    if (text.trim()) return text;
  } catch (skillErr) {
    console.warn("[generate-carousel] Skill falhou, usando fallback:", skillErr);
  }

  // Fallback: standard claude call
  const response = await anthropic.messages.create({
    model:      FALLBACK_MODEL,
    max_tokens: 8192,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userMessage }],
  });
  return response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      client_id:           string;
      theme:               string;
      objective:           string;
      slide_count?:        number;
      dna_images?:         { b64: string; mime: string }[]; // array de slides do carrossel de referência
      dna_image_base64?:   string;  // legado — aceito como dna_images[0]
      dna_image_type?:     string;
      extra_instructions?: string;
    };

    // Normalizar: unificar dna_image_base64 legado + novo dna_images
    const dnaImagesAll: { b64: string; mime: string }[] = body.dna_images?.length
      ? body.dna_images
      : body.dna_image_base64
        ? [{ b64: body.dna_image_base64, mime: body.dna_image_type ?? "image/jpeg" }]
        : [];
    // Limitar a 5 imagens — Sonnet com 5 imagens de 500px fica ~20-30s, dentro do timeout de 60s
    const dnaImages = dnaImagesAll.slice(0, 5);

    if (!body.client_id || !body.theme || !body.objective) {
      return NextResponse.json({ error: "client_id, theme e objective são obrigatórios" }, { status: 400 });
    }

    // ── Rate limit ────────────────────────────────────────────────────────────
    const rl = await checkRateLimit(user.uid);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Limite diário de ${AI_DAILY_LIMIT} gerações atingido.` },
        { status: 429, headers: { "X-RateLimit-Reset": rl.resetAt } }
      );
    }

    // ── Buscar cliente ────────────────────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(body.client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    const client = { id: body.client_id, ...clientDoc.data() } as BrandProfile;

    const slideCount = Math.min(Math.max(body.slide_count ?? 7, 3), 20);

    // ── Montar prompt ─────────────────────────────────────────────────────────
    const systemPrompt = buildCarouselPrompt(client, slideCount);

    // ── Montar user message ───────────────────────────────────────────────────
    const userText = [
      `Crie um carrossel com ${slideCount} slides sobre: **${body.theme}**`,
      `Objetivo: ${body.objective}`,
      body.extra_instructions
        ? `\n⚡ INSTRUÇÕES ADICIONAIS (prioridade máxima):\n${body.extra_instructions}`
        : "",
      "\nRetorne SOMENTE o JSON. Sem markdown, sem backticks.",
    ].join("\n");

    // ── Montar user content — múltiplos slides de referência ─────────────────
    type ImageBlock = { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string } };
    type TextBlock  = { type: "text"; text: string };

    const userContent: Anthropic.MessageParam["content"] = dnaImages.length > 0
      ? [
          // Todos os slides de referência como blocos de imagem
          ...dnaImages.map((img): ImageBlock => ({
            type: "image",
            source: {
              type:       "base64",
              media_type: (img.mime || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data:       img.b64,
            },
          })),
          // Instrução de DNA contextualizada
          {
            type: "text",
            text: dnaImages.length === 1
              ? `DNA VISUAL DE REFERÊNCIA: A imagem acima é um slide do carrossel de referência. Analise a paleta, tipografia, layout e mood. Copie fielmente o estilo visual no visual_prompt do slide hook.\n\n${userText}`
              : `DNA VISUAL DE REFERÊNCIA: As ${dnaImages.length} imagens acima são os slides completos do carrossel de referência. Analise o sistema visual completo: paleta de cores consistente entre slides, estilo tipográfico, hierarquia visual, mood e composição. Replique esse sistema visual fielmente no visual_prompt do slide hook e descreva o estilo nos slides de conteúdo.\n\n${userText}`,
          } as TextBlock,
        ]
      : userText;

    // ── Chamar Claude ─────────────────────────────────────────────────────────
    // Com imagens de DNA: usar Sonnet direto (Opus com visão pode exceder 60s no Vercel)
    const rawText = dnaImages.length > 0
      ? await (async () => {
          const resp = await anthropic.messages.create({
            model:      VISION_MODEL,
            max_tokens: 8192,
            system:     systemPrompt,
            messages:   [{ role: "user", content: userContent }],
          });
          return resp.content
            .filter(b => b.type === "text")
            .map(b => (b as { type: "text"; text: string }).text)
            .join("");
        })()
      : await callCarouselSkill(systemPrompt, userContent);

    function extractJson(text: string): CarouselJSON | null {
      const stripped = text.replace(/^```(?:json)?\s*/im, "").replace(/\s*```\s*$/m, "").trim();
      try { return JSON.parse(stripped) as CarouselJSON; } catch { /* continua */ }
      const first = text.indexOf("{");
      const last  = text.lastIndexOf("}");
      if (first !== -1 && last > first) {
        try { return JSON.parse(text.slice(first, last + 1)) as CarouselJSON; } catch { /* continua */ }
      }
      if (first !== -1) {
        const partial = text.slice(first);
        const opens   = (partial.match(/\{/g) ?? []).length;
        const closes  = (partial.match(/\}/g) ?? []).length;
        const patched = partial + "}".repeat(Math.max(0, opens - closes));
        try { return JSON.parse(patched) as CarouselJSON; } catch { /* desiste */ }
      }
      return null;
    }

    const carouselData = extractJson(rawText);
    if (!carouselData) {
      console.error("[generate-carousel] JSON inválido:", rawText.slice(0, 400));
      return NextResponse.json({ error: "Claude retornou JSON inválido. Tente novamente." }, { status: 500 });
    }

    // Validate slides array
    if (!Array.isArray(carouselData.slides) || carouselData.slides.length < 2) {
      return NextResponse.json({ error: "Claude não gerou slides válidos." }, { status: 500 });
    }

    // ── Disparar Freepik para slide hook ──────────────────────────────────────
    const hookSlide = carouselData.slides.find(s => s.type === "hook" || s.index === 0);
    let hookTaskId: string | null = null;
    let imageProvider: string = "mystic";

    if (hookSlide?.visual_prompt) {
      const aspect = freepikAspect("feed", isSeedreamEnabled() ? "seedream" : "mystic");
      if (isSeedreamEnabled()) {
        const task = await createSeedreamTask({ prompt: hookSlide.visual_prompt, aspect_ratio: aspect });
        hookTaskId = task.task_id;
        imageProvider = "seedream";
      } else {
        const params: FreepikGenerateParams = {
          prompt:       hookSlide.visual_prompt,
          aspect_ratio: aspect,
          realism:      true,
        };
        const task = await createTask(params);
        hookTaskId = task.task_id;
        imageProvider = "mystic";
      }
    }

    // ── Salvar no Firestore ───────────────────────────────────────────────────
    const ref = adminDb.collection("carousels").doc();
    const now = FieldValue.serverTimestamp();

    const carouselDoc: Omit<GeneratedCarousel, "id" | "created_at" | "updated_at"> = {
      agency_id:        user.uid,
      client_id:        body.client_id,
      client_name:      client.name,
      theme:            body.theme,
      objective:        body.objective,
      topic:            carouselData.topic ?? body.theme,
      caption:          carouselData.caption ?? "",
      hashtags:         carouselData.hashtags ?? [],
      slides:           carouselData.slides,
      slide_count:      carouselData.slides.length,
      hook_task_id:     hookTaskId,
      hook_image_url:   null,
      image_provider:   imageProvider,
      dna_reference_url: null,
      status:           hookTaskId ? "generating_hook" : "composing",
    };

    await ref.set({
      id: ref.id,
      ...carouselDoc,
      created_at: now,
      updated_at: now,
    });

    return NextResponse.json({
      carousel_id: ref.id,
      task_id:     hookTaskId,
      topic:       carouselData.topic,
      slides:      carouselData.slides,
      caption:     carouselData.caption,
      hashtags:    carouselData.hashtags,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/carousels/generate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
