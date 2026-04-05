/**
 * POST /api/clients/[id]/analyze-reference
 *
 * Analisa uma imagem de referência visual usando o Analisador Visual Blueprint.
 * O Claude extrai o DNA visual completo da imagem e salva como design_example
 * no Firestore para ser usado como referência pelo Art Director Agent.
 *
 * Body (JSON):
 *   image_url:    string  — URL pública da imagem (Instagram og:image, R2, etc)
 *   source_url?:  string  — URL original do post no Instagram
 *   format?:      "feed" | "stories" | "reels_cover"  (hint opcional)
 *
 * Resposta:
 *   { id, visual_prompt, layout_prompt, pilar, format, description }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  SKILLS_BETA, CODE_EXEC_BETA,
  CODE_EXECUTION_TOOL, CONTAINER_ANALISADOR,
} from "@/lib/skills";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { FieldValue } from "firebase-admin/firestore";
import type { DesignExample } from "@/types";

export const maxDuration = 60;

// ── SKILL blueprint (inline — mirrors the SKILL.md prompt body) ───────────────
// This is the same instructions as in analisador-visual-blueprint SKILL.md,
// embedded here so the analysis works even without the skill being uploaded.
const ANALYZER_SYSTEM = `Você é um analista visual sênior especializado em engenharia reversa de imagens para agências de marketing digital. Sua função é receber qualquer imagem e produzir um JSON extremamente detalhado que funciona como um "blueprint de DNA visual" — permitindo que o Art Director Agent do PostAI recrie o estilo com fidelidade máxima.

REGRAS:
1. Retorne SOMENTE o JSON válido. Nada de markdown, backticks, explicações ou comentários.
2. Precisão cirúrgica: cores em HEX, posições em % relativo ao canvas, ângulos em graus.
3. Descreva CADA elemento visível individualmente.
4. OCR perfeito: transcreva textos EXATAMENTE como aparecem.
5. Ordem de camadas: elementos ordenados por z_index (fundo → frente).
6. Fontes: sugira a mais próxima disponível no Google Fonts.
7. "visual_prompt" e "layout_prompt": SEMPRE em inglês.
8. "recreation_prompt": em português-BR.

Retorne JSON com esta estrutura:
{
  "canvas": { "width_px": 1080, "height_px": 1350, "aspect_ratio": "4:5", "background": { "type": "solid|gradient|image", "color": "#hex", "description": "..." } },
  "metadata": {
    "summary": "1-2 frases",
    "category": "post-instagram|story|banner|carrossel",
    "visual_style": "flat|3d|minimalista|corporativo|editorial|glassmorphism|bold-typography|commercial-photography",
    "mood": "profissional|divertido|urgente|elegante|acolhedor|premium|descolado",
    "dominant_colors": ["#hex1", "#hex2", "#hex3"],
    "estimated_platform": "instagram-feed|instagram-stories",
    "pilar": "Produto|Educação|Prova Social|Bastidores|Engajamento|Promoção|Trend",
    "format": "feed|stories|reels_cover",
    "composition_zone": "left|right|bottom|top|center",
    "color_mood": "descrição em inglês do mood das cores"
  },
  "elements": [
    {
      "id": "el_01", "type": "text|shape|icon|image_region|line|decorative",
      "z_index": 0, "position": { "x_pct": 50, "y_pct": 50 },
      "size": { "width_pct": 80, "height_pct": 15 }, "opacity": 1.0,
      "content": "texto exato",
      "font": { "family": "Montserrat", "size_pt": 72, "weight": 900, "style": "normal", "color": "#FFFFFF", "align": "center", "line_height": 1.1, "text_transform": "uppercase" },
      "fill": { "type": "solid|gradient|none", "color": "#hex" },
      "border_radius_px": 12,
      "region_description": "DESCRIÇÃO DETALHADA em inglês para prompt de IA",
      "region_type": "fotografia|ilustração|textura",
      "dominant_color": "#hex"
    }
  ],
  "layout": { "type": "freeform|centered|split|layered|grid", "alignment_description": "...", "visual_hierarchy": "...", "safe_zone_respected": true },
  "typography_system": [{ "role": "heading|subheading|body|caption|cta", "sample_text": "...", "font_family": "Montserrat", "font_weight": 900, "relative_size": "extra-large|large|medium|small" }],
  "effects": { "overlays": "gradiente escuro | nenhum", "textures": "noise | nenhum", "filters": "nenhum|warm tone" },
  "postai_design_example": {
    "visual_prompt": "detailed photography/design prompt in English — scene, lighting, mood, style, colors. Ready for Freepik Mystic or FAL.ai Flux Pro Ultra.",
    "layout_prompt": "Instagram design composition in English: text position, overlay style, typography. End with: 'All text overlays are in Brazilian Portuguese (pt-BR).'",
    "visual_headline_style": "bold white Montserrat 900 all-caps on dark gradient | etc",
    "description": "descrição em português do estilo visual para catalogar",
    "color_mood": "warm golden tones | dark premium with neon accent | etc"
  },
  "recreation_prompt": "Prompt completo em português-BR para o Art Director Agent recriar este estilo do zero."
}`;

// ── Anthropic client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Route handler ────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: client_id } = await params;

    // ── Verificar ownership do cliente ────────────────────────────────────────
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // ── Ler body ──────────────────────────────────────────────────────────────
    const body = await req.json() as {
      image_url:   string;
      source_url?: string;
      format?:     "feed" | "stories" | "reels_cover";
    };

    if (!body.image_url) {
      return NextResponse.json({ error: "image_url é obrigatório" }, { status: 400 });
    }

    // ── Baixar imagem e converter para base64 ─────────────────────────────────
    const imgResponse = await fetch(body.image_url, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!imgResponse.ok) {
      return NextResponse.json(
        { error: `Não foi possível baixar a imagem: HTTP ${imgResponse.status}` },
        { status: 422 }
      );
    }

    const contentType = imgResponse.headers.get("content-type") ?? "image/jpeg";
    const mediaType   = (contentType.split(";")[0].trim()) as
      "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    const imgBuffer   = await imgResponse.arrayBuffer();
    const base64Data  = Buffer.from(imgBuffer).toString("base64");

    // ── Chamar Claude claude-opus-4-5 com a imagem + Analisador Visual Skill ───────────
    const message = await anthropic.beta.messages.create({
      model:      "claude-opus-4-5",
      max_tokens: 4096,
      betas:      [SKILLS_BETA, CODE_EXEC_BETA],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      container:  CONTAINER_ANALISADOR as any,
      tools:      [CODE_EXECUTION_TOOL],
      system:     ANALYZER_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type:       "base64",
                media_type: mediaType,
                data:       base64Data,
              },
            },
            {
              type: "text",
              text: body.format
                ? `Analise esta imagem para o formato: ${body.format}. Extraia o DNA visual completo e retorne o JSON estruturado.`
                : "Analise esta imagem e extraia o DNA visual completo. Retorne o JSON estruturado.",
            },
          ],
        },
      ],
    });

    // ── Parsear JSON retornado pelo Claude ────────────────────────────────────
    const rawText = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Remove markdown fences se presentes
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let blueprint: Record<string, unknown>;
    try {
      blueprint = JSON.parse(cleaned);
    } catch {
      console.error("[analyze-reference] JSON inválido:", cleaned.slice(0, 500));
      return NextResponse.json(
        { error: "Claude retornou JSON inválido. Tente novamente." },
        { status: 500 }
      );
    }

    // ── Extrair campos do blueprint ───────────────────────────────────────────
    const pde = blueprint.postai_design_example as Record<string, string> | undefined;
    const meta = blueprint.metadata as Record<string, string | string[]> | undefined;

    const visual_prompt         = pde?.visual_prompt ?? "";
    const layout_prompt         = pde?.layout_prompt ?? "";
    const visual_headline_style = pde?.visual_headline_style ?? "";
    const description           = pde?.description ?? meta?.summary as string ?? "";
    const color_mood            = pde?.color_mood ?? meta?.color_mood as string ?? "";
    const pilar                 = (meta?.pilar as string) ?? "Produto";
    const format                = (body.format ?? meta?.format as string ?? "feed") as "feed" | "stories" | "reels_cover";
    const composition_zone      = (meta?.composition_zone as string ?? "bottom") as DesignExample["composition_zone"];

    if (!visual_prompt || !layout_prompt) {
      return NextResponse.json(
        { error: "Análise incompleta: visual_prompt ou layout_prompt ausente" },
        { status: 500 }
      );
    }

    // ── Salvar no Firestore como design_example ───────────────────────────────
    const ref = adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples").doc();

    const example: Omit<DesignExample, "id" | "created_at"> = {
      agency_id:            user.uid,
      client_id,
      visual_prompt,
      layout_prompt,
      visual_headline_style,
      pilar,
      format,
      description,
      color_mood,
      composition_zone,
      source_url:           body.source_url ?? undefined,
      image_url:            body.image_url,
    };

    await ref.set({
      id:         ref.id,
      ...example,
      created_at: FieldValue.serverTimestamp(),
    });

    // ── Resposta ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      id:                    ref.id,
      visual_prompt,
      layout_prompt,
      visual_headline_style,
      pilar,
      format,
      description,
      color_mood,
      composition_zone,
      blueprint,            // blueprint completo para debug/preview
    }, { status: 201 });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[POST /api/clients/[id]/analyze-reference]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
