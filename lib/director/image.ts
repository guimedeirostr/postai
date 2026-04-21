import { createPrediction, getPrediction } from "@/lib/replicate";
import { uploadToR2 } from "@/lib/r2";
import type { ReplicateImageModel } from "@/lib/replicate";
import type { TraceEmitter } from "@/types";

// Maps Canvas formato keys to the short keys used in ASPECT_RATIO
const FORMAT_NORMALIZE: Record<string, string> = {
  ig_feed:          'feed',
  ig_carousel:      'carousel',
  ig_stories:       'stories',
  ig_reels_cover:   'reels_cover',
  li_post_square:   'feed',
  li_post_horizontal: 'feed',
  li_carousel_pdf:  'carousel',
  li_article:       'feed',
  feed:             'feed',
  carousel:         'carousel',
  stories:          'stories',
  reels_cover:      'reels_cover',
};

const MODEL_ASPECTS: Record<string, Record<string, string>> = {
  "google/nano-banana-2":             { feed: "4:5", carousel: "4:5", stories: "9:16", reels_cover: "9:16" },
  "google/imagen-4-ultra":            { feed: "3:4", carousel: "3:4", stories: "9:16", reels_cover: "9:16" },
  "google/imagen-4":                  { feed: "3:4", carousel: "3:4", stories: "9:16", reels_cover: "9:16" },
  "black-forest-labs/flux-kontext-pro": { feed: "4:5", carousel: "4:5", stories: "9:16", reels_cover: "9:16" },
  "black-forest-labs/flux-1.1-pro":   { feed: "4:5", carousel: "4:5", stories: "9:16", reels_cover: "9:16" },
  "black-forest-labs/flux-dev":       { feed: "4:5", carousel: "4:5", stories: "9:16", reels_cover: "9:16" },
  "ideogram-ai/ideogram-v3-turbo":    { feed: "PORTRAIT", carousel: "PORTRAIT", stories: "VERTICAL", reels_cover: "VERTICAL" },
};

function buildInput(model: ReplicateImageModel, prompt: string, normalizedFormat: string): Record<string, unknown> {
  const ar = MODEL_ASPECTS[model]?.[normalizedFormat] ?? MODEL_ASPECTS["google/imagen-4"][normalizedFormat] ?? "3:4";
  switch (model) {
    case "google/nano-banana-2":
      return { prompt, aspect_ratio: ar, output_format: "jpg" };
    case "google/imagen-4-ultra":
      return { prompt, aspect_ratio: ar, output_format: "jpg", safety_filter_level: "block_medium_and_above" };
    case "google/imagen-4":
      return { prompt, aspect_ratio: ar, output_format: "jpg" };
    case "black-forest-labs/flux-kontext-pro":
    case "black-forest-labs/flux-1.1-pro":
      return { prompt, aspect_ratio: ar, output_format: "jpg", output_quality: 90 };
    case "black-forest-labs/flux-dev":
      return { prompt, aspect_ratio: ar, output_format: "jpg", output_quality: 90, go_fast: true };
    case "ideogram-ai/ideogram-v3-turbo":
      return { prompt, aspect_ratio: ar, style_type: "REALISTIC", magic_prompt_option: "OFF", output_format: "jpg" };
    default:
      return { prompt, aspect_ratio: ar };
  }
}

function extractUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && output.length > 0) return output[0] as string;
  return null;
}

async function downloadAndUpload(remoteUrl: string, clientId: string, model: string, slideN?: number, emit?: TraceEmitter): Promise<string> {
  const apiKey = process.env.REPLICATE_API_KEY ?? '';
  const slug = model.replace(/\//g, '-').replace(/[^a-z0-9-]/g, '');
  const suffix = slideN != null ? `-s${slideN}` : '';

  const res = await fetch(remoteUrl, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Falha ao baixar imagem do Replicate: ${res.status}`);

  const ct  = res.headers.get('content-type') ?? 'image/jpeg';
  const ext = ct.includes('png') ? 'png' : 'jpg';
  const buf = Buffer.from(await res.arrayBuffer());
  const key = `canvas/${clientId}/${slug}-${Date.now()}${suffix}.${ext}`;

  emit?.({ ts: Date.now(), level: "info", code: "r2.upload",
    message: `${Math.round(buf.length / 1024)}kB → ${key}`,
    meta: { key, sizeBytes: buf.length, contentType: ct } });

  return uploadToR2(key, buf, ct);
}

export interface DirectorImageParams {
  clientId: string;
  promptCompilado: string;
  formato: string;
  model?: ReplicateImageModel;
  slideN?: number;
  emit?: TraceEmitter;
}

export async function runDirectorImage(params: DirectorImageParams): Promise<{ imageUrl: string }> {
  const {
    clientId,
    promptCompilado,
    formato,
    model = 'google/nano-banana-2',
    slideN,
    emit,
  } = params;

  if (!promptCompilado?.trim()) {
    throw Object.assign(new Error('Prompt compilado vazio'), { code: 'EMPTY_PROMPT' });
  }

  const normalizedFormat = FORMAT_NORMALIZE[formato] ?? 'feed';
  const input = buildInput(model, promptCompilado, normalizedFormat);

  let pred = await createPrediction(model, input);

  emit?.({ ts: Date.now(), level: "info", code: "replicate.predict",
    message: `${model}`,
    meta: { predictionId: pred.id, model } });

  // Poll until succeeded/failed (max 55 s — leaves buffer for Vercel's 60s limit)
  const deadline = Date.now() + 55_000;
  while (
    pred.status !== 'succeeded' &&
    pred.status !== 'failed' &&
    pred.status !== 'canceled' &&
    Date.now() < deadline
  ) {
    await new Promise(r => setTimeout(r, 3_000));
    pred = await getPrediction(pred.id);
    emit?.({ ts: Date.now(), level: "info", code: "replicate.status",
      message: pred.status,
      meta: { status: pred.status, predictionId: pred.id } });
  }

  if (pred.status === 'failed' || pred.status === 'canceled') {
    throw Object.assign(
      new Error(pred.error ?? 'Geração de imagem falhou no Replicate'),
      { code: 'PROVIDER_ERROR', details: pred.error },
    );
  }
  if (pred.status !== 'succeeded') {
    throw Object.assign(new Error('Timeout na geração de imagem (>55s)'), { code: 'TIMEOUT' });
  }

  const remoteUrl = extractUrl(pred.output);
  if (!remoteUrl) {
    throw Object.assign(new Error('Replicate retornou succeeded sem output URL'), { code: 'NO_OUTPUT' });
  }

  const imageUrl = await downloadAndUpload(remoteUrl, clientId, model, slideN, emit);
  return { imageUrl };
}
