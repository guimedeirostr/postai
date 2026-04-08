/**
 * lib/replicate.ts
 *
 * Cliente Replicate para PostAI — hub central de modelos externos.
 *
 * Modelos suportados:
 * ┌───────────────────────────────────────┬────────────────────────────────────┐
 * │ Modelo                                │ Uso                                │
 * ├───────────────────────────────────────┼────────────────────────────────────┤
 * │ google/imagen-4                       │ Geração de imagem txt2img          │
 * │ black-forest-labs/flux-kontext-pro    │ txt2img com forte aderência prompt │
 * │ black-forest-labs/flux-1.1-pro        │ txt2img qualidade/diversidade      │
 * │ ideogram-ai/ideogram-v3-turbo         │ txt2img — bom com texto na imagem  │
 * │ cjwbw/midas                           │ Depth estimation (upload pipeline) │
 * │ topazlabs/image-upscale               │ Upscale profissional               │
 * └───────────────────────────────────────┴────────────────────────────────────┘
 *
 * Padrão de integração (igual ao Freepik/Seedream):
 *   generate-image → createImagePrediction() → retorna prediction_id como task_id
 *   check-image    → getPrediction()         → polling até succeeded/failed
 *
 * Env:
 *   REPLICATE_API_KEY  — obrigatório para qualquer operação
 */

import { uploadToR2 } from "@/lib/r2";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

export type ReplicateStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

export interface ReplicatePrediction {
  id:        string;
  status:    ReplicateStatus;
  output?:   string | string[] | null;
  error?:    string | null;
  urls?: {
    get:    string;
    cancel: string;
  };
}

/** Modelos disponíveis para geração de imagem */
export type ReplicateImageModel =
  | "google/imagen-4"
  | "black-forest-labs/flux-kontext-pro"
  | "black-forest-labs/flux-1.1-pro"
  | "ideogram-ai/ideogram-v3-turbo";

// ─────────────────────────────────────────────────────────────────────────────
// Aspect ratio por formato PostAI
// ─────────────────────────────────────────────────────────────────────────────

const ASPECT_RATIO: Record<string, Record<string, string>> = {
  "google/imagen-4": {
    feed:        "3:4",   // Imagen 4 não suporta 4:5 nativo
    stories:     "9:16",
    reels_cover: "9:16",
  },
  "black-forest-labs/flux-kontext-pro": {
    feed:        "4:5",
    stories:     "9:16",
    reels_cover: "9:16",
  },
  "black-forest-labs/flux-1.1-pro": {
    feed:        "4:5",
    stories:     "9:16",
    reels_cover: "9:16",
  },
  "ideogram-ai/ideogram-v3-turbo": {
    feed:        "PORTRAIT",   // Ideogram usa nomes por extenso
    stories:     "VERTICAL",
    reels_cover: "VERTICAL",
  },
};

function resolveAspectRatio(model: string, format: string): string {
  return ASPECT_RATIO[model]?.[format] ?? ASPECT_RATIO["google/imagen-4"][format] ?? "3:4";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.REPLICATE_API_KEY;
  if (!key) throw new ReplicateError("REPLICATE_API_KEY não configurada");
  return key;
}

function replicateHeaders(apiKey: string): HeadersInit {
  return {
    "Authorization":  `Bearer ${apiKey}`,
    "Content-Type":   "application/json",
    "Prefer":         "wait",   // tenta resposta síncrona (até 60s)
  };
}

/** Extrai a primeira URL de output de uma prediction */
function extractOutputUrl(output: ReplicatePrediction["output"]): string | null {
  if (!output) return null;
  if (typeof output === "string") return output;
  if (Array.isArray(output) && output.length > 0) return output[0];
  return null;
}

/** Monta o input correto para cada modelo */
function buildModelInput(
  model:   ReplicateImageModel,
  prompt:  string,
  format:  string,
): Record<string, unknown> {
  const ar = resolveAspectRatio(model, format);

  switch (model) {
    case "google/imagen-4":
      return { prompt, aspect_ratio: ar, output_format: "jpg" };

    case "black-forest-labs/flux-kontext-pro":
      return { prompt, aspect_ratio: ar, output_format: "jpg", output_quality: 90 };

    case "black-forest-labs/flux-1.1-pro":
      return { prompt, aspect_ratio: ar, output_format: "jpg", output_quality: 90 };

    case "ideogram-ai/ideogram-v3-turbo":
      return {
        prompt,
        aspect_ratio:    ar,
        style_type:      "REALISTIC",
        output_format:   "jpg",
      };

    default:
      return { prompt, aspect_ratio: ar };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class ReplicateError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ReplicateError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: createPrediction / getPrediction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cria uma prediction assíncrona num modelo Replicate.
 * Usa `Prefer: wait` — se o modelo responder em <60s, já retorna com output.
 *
 * @returns prediction completa (pode já estar succeeded) ou com status starting/processing
 */
export async function createPrediction(
  model: string,
  input: Record<string, unknown>,
): Promise<ReplicatePrediction> {
  const apiKey = getApiKey();

  const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
    method:  "POST",
    headers: replicateHeaders(apiKey),
    body:    JSON.stringify({ input }),
    signal:  AbortSignal.timeout(65_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new ReplicateError(body.detail ?? `Replicate HTTP ${res.status}`, res.status);
  }

  return res.json() as Promise<ReplicatePrediction>;
}

/**
 * Consulta o status de uma prediction existente (polling).
 * Chamado pelo check-image route até status ser succeeded ou failed.
 */
export async function getPrediction(predictionId: string): Promise<ReplicatePrediction> {
  const apiKey = getApiKey();

  const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new ReplicateError(body.detail ?? `Replicate poll HTTP ${res.status}`, res.status);
  }

  return res.json() as Promise<ReplicatePrediction>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GERAÇÃO DE IMAGEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispara geração de imagem no Replicate.
 *
 * Se `Prefer: wait` entregar resultado imediato (succeeded) →
 *   baixa, sobe pro R2 e retorna { task_id, image_url, done: true }
 *
 * Se ainda estiver processing →
 *   retorna { task_id, done: false } → frontend faz polling em check-image
 */
export async function generateImageReplicate({
  prompt,
  format,
  post_id,
  model = "google/imagen-4",
}: {
  prompt:   string;
  format:   "feed" | "stories" | "reels_cover";
  post_id:  string;
  model?:   ReplicateImageModel;
}): Promise<{ task_id: string; image_url?: string; done: boolean }> {
  const input = buildModelInput(model, prompt, format);
  const pred  = await createPrediction(model, input);

  // Resposta síncrona — já tem output
  if (pred.status === "succeeded") {
    const remoteUrl = extractOutputUrl(pred.output);
    if (!remoteUrl) throw new ReplicateError("Replicate retornou succeeded sem output URL");

    const image_url = await downloadAndUpload(remoteUrl, post_id, model);
    return { task_id: pred.id, image_url, done: true };
  }

  if (pred.status === "failed" || pred.status === "canceled") {
    throw new ReplicateError(pred.error ?? "Geração falhou no Replicate");
  }

  // Ainda processing — frontend fará polling
  return { task_id: pred.id, done: false };
}

/**
 * Verifica status de uma prediction de imagem.
 * Chamado pelo check-image route a cada ~4s.
 *
 * @returns { status, image_url? } onde status = "COMPLETED" | "FAILED" | "PENDING"
 */
export async function pollReplicateImage(predictionId: string, post_id: string): Promise<{
  status:     "COMPLETED" | "FAILED" | "PENDING";
  image_url?: string;
}> {
  const pred = await getPrediction(predictionId);

  if (pred.status === "succeeded") {
    const remoteUrl = extractOutputUrl(pred.output);
    if (!remoteUrl) return { status: "FAILED" };
    const image_url = await downloadAndUpload(remoteUrl, post_id, "replicate");
    return { status: "COMPLETED", image_url };
  }

  if (pred.status === "failed" || pred.status === "canceled") {
    return { status: "FAILED" };
  }

  return { status: "PENDING" };
}

/** Baixa imagem da URL do Replicate e sobe pro R2 */
async function downloadAndUpload(
  remoteUrl: string,
  post_id:   string,
  model:     string,
): Promise<string> {
  const apiKey = getApiKey();
  const slug   = model.replace(/\//g, "-").replace(/[^a-z0-9-]/g, "");

  const res = await fetch(remoteUrl, {
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal:  AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new ReplicateError(`Falha ao baixar output do Replicate: ${res.status}`);

  const ct  = res.headers.get("content-type") ?? "image/jpeg";
  const ext = ct.includes("png") ? "png" : "jpg";
  const buf = Buffer.from(await res.arrayBuffer());
  const key = `posts/${post_id}/${slug}-${Date.now()}.${ext}`;

  return uploadToR2(key, buf, ct);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPTH ESTIMATION (MiDaS — para pipeline de upload de fotos)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estima profundidade monocular via MiDaS no Replicate.
 * NÃO deve ser chamado no pipeline real-time (latência ~11s).
 * Use no background após upload de fotos na biblioteca.
 *
 * @param imageUrl  URL pública da foto (R2 ou Firebase Storage)
 * @returns "shallow" | "deep" | "mixed" — ou null se falhar
 */
export async function estimateDepth(
  imageUrl: string,
): Promise<"shallow" | "deep" | "mixed" | null> {
  try {
    const pred = await createPrediction("cjwbw/midas", {
      image:      imageUrl,
      model_type: "MiDaS_small",   // mais rápido; dpt_beit_large_512 = qualidade máxima
    });

    // MiDaS pode ser mais lento — pega o ID e faz polling se necessário
    let finalPred = pred;
    if (pred.status === "starting" || pred.status === "processing") {
      finalPred = await pollUntilDone(pred.id, 30_000);
    }

    if (finalPred.status !== "succeeded") return null;

    const depthMapUrl = extractOutputUrl(finalPred.output);
    if (!depthMapUrl) return null;

    // Analisa o depth map com Sharp para classificar DOF
    return analyzeDepthMap(depthMapUrl);
  } catch {
    return null;
  }
}

/** Polling simples até succeeded/failed */
async function pollUntilDone(
  predId:      string,
  timeoutMs:   number,
): Promise<ReplicatePrediction> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2_000));
    const pred = await getPrediction(predId);
    if (pred.status === "succeeded" || pred.status === "failed" || pred.status === "canceled") {
      return pred;
    }
  }
  throw new ReplicateError("MiDaS timeout");
}

/**
 * Baixa o depth map (imagem grayscale) e usa Sharp para classificar:
 *   - Alta variância entre quadrantes → DOF raso (shallow) — sujeito muito mais próximo que fundo
 *   - Baixa variância → DOF profundo (deep) — tudo na mesma profundidade
 */
async function analyzeDepthMap(
  depthMapUrl: string,
): Promise<"shallow" | "deep" | "mixed"> {
  const { default: sharp } = await import("sharp");

  const res = await fetch(depthMapUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return "mixed";

  const buf = Buffer.from(await res.arrayBuffer());
  const W = 100, H = 133;

  const raw = await sharp(buf)
    .resize(W, H, { fit: "cover" })
    .grayscale()
    .raw()
    .toBuffer();

  const pixels = new Uint8Array(raw);
  const mid    = Math.floor(H / 2);
  const midW   = Math.floor(W / 2);

  let sumCenter = 0, sumEdge = 0, nCenter = 0, nEdge = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = pixels[y * W + x];
      if (y > mid * 0.3 && y < mid * 1.7 && x > midW * 0.3 && x < midW * 1.7) {
        sumCenter += v; nCenter++;
      } else {
        sumEdge += v; nEdge++;
      }
    }
  }

  const centerDepth = nCenter ? sumCenter / nCenter : 128;
  const edgeDepth   = nEdge   ? sumEdge   / nEdge   : 128;
  const delta       = Math.abs(centerDepth - edgeDepth);

  // MiDaS: valores altos = perto (bright = near), valores baixos = longe
  if (delta > 40) return "shallow";
  if (delta > 20) return "mixed";
  return "deep";
}

/**
 * Retorna a URL pública do depth map MiDaS (imagem grayscale).
 * bright = close to camera, dark = far.
 *
 * Usa MiDaS_small para menor latência (~6-10s).
 * Retorna null se Replicate não estiver configurado ou se falhar.
 */
export async function getDepthMapUrl(
  imageUrl:  string,
  timeoutMs: number = 15_000,
): Promise<string | null> {
  if (!isReplicateEnabled()) return null;
  try {
    const pred = await createPrediction("cjwbw/midas", {
      image:      imageUrl,
      model_type: "MiDaS_small",
    });

    let finalPred = pred;
    if (pred.status === "starting" || pred.status === "processing") {
      finalPred = await Promise.race([
        pollUntilDone(pred.id, timeoutMs),
        new Promise<ReplicatePrediction>((_, reject) =>
          setTimeout(() => reject(new Error("depth timeout")), timeoutMs)
        ),
      ]);
    }

    if (finalPred.status !== "succeeded") return null;
    return extractOutputUrl(finalPred.output) ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDEOGRAM COM TIPOGRAFIA NATIVA (texto embutido na arte pela IA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera imagem com texto tipográfico nativo via Ideogram v3.
 *
 * Diferente do fluxo padrão (imagem + compositor), aqui o Ideogram
 * renderiza o texto como parte integral da arte — qualidade tipográfica
 * equivalente a um designer usando Photoshop com fontes reais.
 *
 * @param prompt          Prompt visual completo com texto embutido
 * @param negative_prompt O que evitar
 * @param style_type      REALISTIC | DESIGN | RENDER_3D | ANIME
 * @param format          Formato do post
 * @param post_id         ID do post para upload no R2
 */
export async function generateWithIdeogramText({
  prompt,
  negative_prompt,
  style_type = "REALISTIC",
  format,
  post_id,
}: {
  prompt:           string;
  negative_prompt?: string;
  style_type?:      "REALISTIC" | "DESIGN" | "RENDER_3D" | "ANIME";
  format:           "feed" | "stories" | "reels_cover";
  post_id:          string;
}): Promise<{ task_id: string; image_url?: string; done: boolean }> {
  const ar    = resolveAspectRatio("ideogram-ai/ideogram-v3-turbo", format);
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: ar,
    style_type,
    output_format: "jpg",
    ...(negative_prompt ? { negative_prompt } : {}),
  };

  const pred = await createPrediction("ideogram-ai/ideogram-v3-turbo", input);

  if (pred.status === "succeeded") {
    const remoteUrl = extractOutputUrl(pred.output);
    if (!remoteUrl) throw new ReplicateError("Ideogram retornou succeeded sem output URL");
    const image_url = await downloadAndUpload(remoteUrl, post_id, "ideogram-v3-turbo");
    return { task_id: pred.id, image_url, done: true };
  }

  if (pred.status === "failed" || pred.status === "canceled") {
    throw new ReplicateError(pred.error ?? "Ideogram falhou");
  }

  return { task_id: pred.id, done: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature flag
// ─────────────────────────────────────────────────────────────────────────────

export function isReplicateEnabled(): boolean {
  return !!process.env.REPLICATE_API_KEY;
}
