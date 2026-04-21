// lib/ai/vision.ts
// Analisa imagens de posts usando Claude Vision para extrair VisualDesign

import Anthropic from "@anthropic-ai/sdk";
import type { VisualDesign } from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um especialista em design de marketing para redes sociais. Analise imagens de posts e retorne análises visuais precisas e acionáveis em formato JSON.`;

const DEFAULT_VISUAL_DESIGN: VisualDesign = {
  palette:     "cores não identificadas",
  mood:        "neutro",
  composition: "composição padrão",
  typography:  "tipografia não identificada",
  elements:    "elementos visuais gerais",
  promptHint:  "clean social media aesthetic",
};

export async function analyzePostImage(
  imageBase64: string,
  mediaType: string,
): Promise<VisualDesign> {
  try {
    const validMediaType = (mediaType === "image/jpeg" ||
      mediaType === "image/png" ||
      mediaType === "image/gif" ||
      mediaType === "image/webp")
      ? mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
      : "image/jpeg" as const;

    const message = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: {
                type:       "base64",
                media_type: validMediaType,
                data:       imageBase64,
              },
            },
            {
              type: "text",
              text: `Analise esta imagem de post para redes sociais e retorne um objeto JSON com os campos:
- palette: paleta de cores dominante (ex: "fundo cinza escuro, destaque dourado quente, texto branco")
- mood: tom emocional em 3-5 adjetivos (ex: "luxuoso, elegante, sofisticado")
- composition: composição visual — layout, ponto focal, espaçamento (ex: "produto centralizado, texto assimétrico, espaço generoso")
- typography: estilo de tipografia visível (ex: "título bold sans-serif, corpo light, espaçamento amplo")
- elements: elementos visuais principais (ex: "foto do produto, props mínimos, sombra suave")
- promptHint: descritor visual condensado em INGLÊS, pronto para usar como sufixo de prompt de geração de imagem (ex: "dark luxury aesthetic, centered product, gold accents, bold sans-serif")

Retorne APENAS o JSON, sem markdown.`,
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(cleaned) as Partial<VisualDesign>;

    return {
      palette:     parsed.palette     ?? DEFAULT_VISUAL_DESIGN.palette,
      mood:        parsed.mood        ?? DEFAULT_VISUAL_DESIGN.mood,
      composition: parsed.composition ?? DEFAULT_VISUAL_DESIGN.composition,
      typography:  parsed.typography  ?? DEFAULT_VISUAL_DESIGN.typography,
      elements:    parsed.elements    ?? DEFAULT_VISUAL_DESIGN.elements,
      promptHint:  parsed.promptHint  ?? DEFAULT_VISUAL_DESIGN.promptHint,
    };
  } catch (err) {
    console.error("[analyzePostImage] Erro na análise visual:", err instanceof Error ? err.message : err);
    return { ...DEFAULT_VISUAL_DESIGN };
  }
}
