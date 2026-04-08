/**
 * lib/gemini-image.ts
 *
 * Wrapper para geração de imagem via Gemini 3.1 Flash Image Preview.
 *
 * Diferenciais vs Freepik/Replicate:
 *  - Gera imagem + texto em uma única chamada (nativo multimodal)
 *  - Aceita imagem de referência para img2img (foto da biblioteca ou DNA)
 *  - Streaming — recebe chunks conforme gera
 *  - Retorna base64 diretamente (sem polling)
 */

import { GoogleGenAI } from "@google/genai";

const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

/** Aspecto ratio por formato Instagram */
const ASPECT: Record<string, string> = {
  feed:        "4:5",
  stories:     "9:16",
  reels_cover: "9:16",
  carousel:    "4:5",
};

export interface GeminiImageParams {
  prompt:        string;
  format?:       "feed" | "stories" | "reels_cover" | "carousel";
  /** Imagem de referência (foto da biblioteca ou template de DNA) como base64 */
  reference_b64?:  string;
  reference_mime?: string;
  /** Resolução: "1K" | "2K" | "4K" */
  resolution?:   "1K" | "2K" | "4K";
}

export interface GeminiImageResult {
  /** Buffer JPEG/PNG da imagem gerada */
  buffer:    Buffer;
  mimeType:  string;
  /** Texto que o modelo eventualmente retornou junto (descrição, etc.) */
  text?:     string;
}

export function isGeminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function generateWithGemini(
  params: GeminiImageParams
): Promise<GeminiImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("[gemini-image] GEMINI_API_KEY não configurada.");

  const ai = new GoogleGenAI({ apiKey });

  const aspectRatio = ASPECT[params.format ?? "feed"] ?? "4:5";

  const config = {
    imageConfig: {
      aspectRatio,
      imageSize: params.resolution ?? "2K",
    },
    responseModalities: ["IMAGE", "TEXT"] as string[],
  };

  // Monta parts: referência visual primeiro (se houver), depois o prompt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [];

  if (params.reference_b64) {
    parts.push({
      inlineData: {
        mimeType: params.reference_mime ?? "image/jpeg",
        data:     params.reference_b64,
      },
    });
  }

  parts.push({ text: params.prompt });

  const contents = [{ role: "user", parts }];

  // Coleta chunks do stream
  const stream = await ai.models.generateContentStream({
    model: GEMINI_IMAGE_MODEL,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: config as any,
    contents,
  });

  let imageBuffer: Buffer | null = null;
  let imageMime   = "image/png";
  let textParts: string[] = [];

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        imageBuffer = Buffer.from(part.inlineData.data, "base64");
        imageMime   = part.inlineData.mimeType ?? "image/png";
      }
      if (part.text) {
        textParts.push(part.text);
      }
    }
  }

  if (!imageBuffer) {
    throw new Error("[gemini-image] Nenhuma imagem retornada pelo modelo.");
  }

  return {
    buffer:   imageBuffer,
    mimeType: imageMime,
    text:     textParts.join("") || undefined,
  };
}
