/**
 * lib/fal.ts
 *
 * FAL.ai client completo para PostAI.
 *
 * Modelos disponíveis:
 * ┌─────────────────────────────────┬───────────────────────────────────────────┐
 * │ Função                          │ Modelo FAL                                │
 * ├─────────────────────────────────┼───────────────────────────────────────────┤
 * │ generateImageFal (txt2img)      │ flux-pro/v1.1-ultra / v1.1 / flux/schnell │
 * │ generateWithCharacterLock       │ fal-ai/pulid  (face identity lock)        │
 * │ generateWithCanny               │ fal-ai/flux-pro/v1/canny  (edge control)  │
 * │ generateWithDepth               │ fal-ai/flux-pro/v1/depth  (depth control) │
 * └─────────────────────────────────┴───────────────────────────────────────────┘
 *
 * Env vars:
 *   FALAI_API_KEY         → chave da API (obrigatória)
 *   IMAGE_PROVIDER=fal    → ativa FAL como provider padrão
 *   IMAGE_QUALITY=ultra|standard|fast → tier de qualidade (default: ultra)
 *
 * Preços aproximados:
 *   flux-pro/v1.1-ultra   $0.06/img
 *   flux-pro/v1.1         $0.04/img
 *   flux/schnell          $0.003/img
 *   pulid                 ~$0.05/img
 *   flux-pro/v1/canny     ~$0.05/img
 *   flux-pro/v1/depth     ~$0.05/img
 */

import { uploadToR2 } from "./r2";

// ── Erro ─────────────────────────────────────────────────────────────────────

export class FalError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "FalError";
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function apiKey(): string {
  const key = process.env.FALAI_API_KEY;
  if (!key) throw new FalError("FALAI_API_KEY não configurada");
  return key;
}

async function falPost(model: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://fal.run/${model}`, {
    method:  "POST",
    headers: {
      "Authorization": `Key ${apiKey()}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "unknown error");
    throw new FalError(
      `FAL.ai [${model}] ${res.status}: ${text.slice(0, 300)}`,
      res.status
    );
  }

  return res.json();
}

async function downloadAndStore(
  remoteUrl: string,
  r2Key:     string
): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new FalError(`Falha ao baixar imagem FAL.ai: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadToR2(r2Key, buffer, "image/jpeg");
}

function extractImageUrl(data: unknown): string {
  const d = data as {
    images?: Array<{ url: string }>;
    image?:  { url: string };
  };
  const url = d.images?.[0]?.url ?? d.image?.url;
  if (!url) throw new FalError("FAL.ai não retornou URL de imagem na resposta");
  return url;
}

// ── Provider flag e model selection ──────────────────────────────────────────

export function isFalEnabled(): boolean {
  return process.env.IMAGE_PROVIDER === "fal";
}

const FAL_MODELS: Record<string, string> = {
  ultra:    "fal-ai/flux-pro/v1.1-ultra",  // Melhor qualidade — $0.06/img
  standard: "fal-ai/flux-pro/v1.1",         // Boa qualidade   — $0.04/img
  fast:     "fal-ai/flux/schnell",           // Rápido/barato   — $0.003/img
};

export function resolveFalModel(): string {
  const quality = process.env.IMAGE_QUALITY ?? "ultra";
  return FAL_MODELS[quality] ?? FAL_MODELS.ultra;
}

// ── Aspect ratios ─────────────────────────────────────────────────────────────
// FAL.ai suporta: "21:9"|"16:9"|"4:3"|"3:2"|"1:1"|"2:3"|"3:4"|"9:16"|"9:21"

const ASPECT_RATIO: Record<string, string> = {
  feed:               "3:4",
  stories:            "9:16",
  reels_cover:        "9:16",
  linkedin_post:      "16:9",
  linkedin_carousel:  "1:1",
  linkedin_article:   "16:9",
};

function resolveAspect(format: string): string {
  return ASPECT_RATIO[format] ?? "3:4";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Geração padrão txt2img (Flux Pro)
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateImageFal(opts: {
  prompt:  string;
  format:  "feed" | "stories" | "reels_cover";
  post_id: string;
  model?:  string;
}): Promise<string> {
  const model        = opts.model ?? resolveFalModel();
  const aspect_ratio = resolveAspect(opts.format);

  const data = await falPost(model, {
    prompt:                opts.prompt,
    aspect_ratio,
    num_images:            1,
    output_format:         "jpeg",
    sync_mode:             true,
    enable_safety_checker: false,
    num_inference_steps:   28,
  });

  const remoteUrl = extractImageUrl(data);
  return downloadAndStore(remoteUrl, `posts/${opts.post_id}/fal-raw.jpg`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Character Lock via PuLID — trava identidade/rosto com fotos de referência
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera imagem preservando a identidade facial de uma pessoa de referência.
 *
 * Ideal para:
 *   - Influencers/modelos recorrentes de uma marca
 *   - Consistência de personagem entre posts
 *   - Replicar aparência de fotos do cliente
 *
 * @param reference_urls  URLs públicas ou data URIs das fotos de referência (1-4 imagens)
 * @param id_weight       0.0 = ignora rosto, 1.0 = fiel ao rosto, 1.8 = rígido (default: 1.0)
 * @param start_step      Passo em que o PuLID começa a agir (default: 4, mais cedo = mais fiel)
 */
export async function generateWithCharacterLock(opts: {
  prompt:          string;
  reference_urls:  string[];
  format:          "feed" | "stories" | "reels_cover";
  post_id:         string;
  id_weight?:      number;
  start_step?:     number;
  negative_prompt?: string;
}): Promise<string> {
  const aspect_ratio = resolveAspect(opts.format);

  // PuLID aceita array de referências — usa primeira como principal
  const reference_images = opts.reference_urls.map(url => ({ image_url: url }));

  const data = await falPost("fal-ai/pulid", {
    prompt:           opts.prompt,
    reference_images,
    negative_prompt:  opts.negative_prompt ?? "low quality, blurry, distorted face, bad anatomy",
    num_inference_steps: 28,
    guidance_scale:   4.0,
    id_weight:        opts.id_weight   ?? 1.0,
    start_step:       opts.start_step  ?? 4,
    true_cfg:         1.0,
    image_size:       aspectToSize(aspect_ratio),
    sync_mode:        true,
  });

  const remoteUrl = extractImageUrl(data);
  return downloadAndStore(remoteUrl, `posts/${opts.post_id}/fal-pulid.jpg`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ControlNet Canny — trava estrutura/composição via edge detection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera imagem respeitando a estrutura/bordas de uma imagem de referência.
 *
 * Ideal para:
 *   - Replicar composição de um post aprovado
 *   - Manter posição de sujeito + espaços para texto
 *   - Consistência de layout entre variações de um mesmo post
 *
 * @param control_image  URL pública da imagem de referência para edge detection
 * @param strength       0.0 = ignora estrutura, 1.0 = segue rigidamente (default: 0.7)
 */
export async function generateWithCanny(opts: {
  prompt:         string;
  control_image:  string;
  format:         "feed" | "stories" | "reels_cover";
  post_id:        string;
  strength?:      number;
  negative_prompt?: string;
}): Promise<string> {
  const aspect_ratio = resolveAspect(opts.format);

  const data = await falPost("fal-ai/flux-pro/v1/canny", {
    prompt:            opts.prompt,
    control_image_url: opts.control_image,
    aspect_ratio,
    steps:             28,
    guidance:          3.5,
    strength:          opts.strength ?? 0.7,
    sync_mode:         true,
    output_format:     "jpeg",
  });

  const remoteUrl = extractImageUrl(data);
  return downloadAndStore(remoteUrl, `posts/${opts.post_id}/fal-canny.jpg`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. ControlNet Depth — trava volume/profundidade/perspectiva espacial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Gera imagem preservando a estrutura de profundidade/volume de uma referência.
 *
 * Ideal para:
 *   - Preservar a relação espacial entre sujeito e fundo
 *   - Manter volume/perspectiva de uma foto de produto
 *   - Recriar cenas com mesma profundidade mas estilo diferente
 *
 * @param control_image  URL pública da imagem de referência para depth map
 * @param strength       0.0 = ignora profundidade, 1.0 = segue rigidamente (default: 0.7)
 */
export async function generateWithDepth(opts: {
  prompt:         string;
  control_image:  string;
  format:         "feed" | "stories" | "reels_cover";
  post_id:        string;
  strength?:      number;
  negative_prompt?: string;
}): Promise<string> {
  const aspect_ratio = resolveAspect(opts.format);

  const data = await falPost("fal-ai/flux-pro/v1/depth", {
    prompt:            opts.prompt,
    control_image_url: opts.control_image,
    aspect_ratio,
    steps:             28,
    guidance:          3.5,
    strength:          opts.strength ?? 0.7,
    sync_mode:         true,
    output_format:     "jpeg",
  });

  const remoteUrl = extractImageUrl(data);
  return downloadAndStore(remoteUrl, `posts/${opts.post_id}/fal-depth.jpg`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Converte aspect ratio string em objeto {width, height} para APIs que
 * não aceitam string de ratio (ex: PuLID usa image_size como objeto).
 */
function aspectToSize(ratio: string): { width: number; height: number } {
  const MAP: Record<string, { width: number; height: number }> = {
    "3:4":  { width: 768,  height: 1024 },
    "9:16": { width: 768,  height: 1366 },
    "1:1":  { width: 1024, height: 1024 },
    "4:3":  { width: 1024, height: 768  },
    "16:9": { width: 1366, height: 768  },
  };
  return MAP[ratio] ?? { width: 768, height: 1024 };
}
