/**
 * Freepik API client — supports Mystic (img gen v1) and Seedream V5 Lite.
 *
 * Provider is selected via IMAGE_PROVIDER env:
 *   IMAGE_PROVIDER=seedream  → Seedream V5 Lite (txt2img + edit)
 *   (unset / anything else)  → Freepik Mystic (original behavior)
 *
 * Both providers share the same async task pattern:
 *   POST → { task_id }  →  poll GET /{task_id}  →  { status, generated[] }
 */

const FREEPIK_API_KEY = () => process.env.FREEPIK_API_KEY ?? "";

// ── Base URLs ────────────────────────────────────────────────────────────────
const MYSTIC_BASE    = "https://api.freepik.com/v1/ai/mystic";
const SEEDREAM_BASE  = "https://api.freepik.com/v1/ai/text-to-image/seedream-v5-lite";
const SEEDREAM_EDIT  = "https://api.freepik.com/v1/ai/text-to-image/seedream-v5-lite-edit";

const MAX_RETRIES    = 3;
const RETRY_DELAY_MS = 1500;

export function isSeedreamEnabled(): boolean {
  return process.env.IMAGE_PROVIDER === "seedream";
}

// ── Shared HTTP client ───────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function freepikFetch(
  url: string,
  init: RequestInit,
  attempt = 1
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type":      "application/json",
      "x-freepik-api-key": FREEPIK_API_KEY(),
      ...(init.headers as Record<string, string> ?? {}),
    },
  });

  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new FreepikAuthError(
      `Freepik API key inválida ou expirada (401). Verifique FREEPIK_API_KEY.`,
      body
    );
  }

  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY_MS * attempt);
    return freepikFetch(url, init, attempt + 1);
  }

  return res;
}

// ── Errors ───────────────────────────────────────────────────────────────────
export class FreepikAuthError extends Error {
  constructor(message: string, public readonly details: unknown) {
    super(message);
    this.name = "FreepikAuthError";
  }
}

// ── Shared types ─────────────────────────────────────────────────────────────
export interface FreepikTask {
  task_id: string;
}

export type FreepikTaskStatus = "PENDING" | "CREATED" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface FreepikTaskResult {
  status:    FreepikTaskStatus;
  image_url: string | null;
  raw?:      unknown;
}

// ── Aspect ratio maps ────────────────────────────────────────────────────────
/** Mystic supports social_post_4_5 (exact Instagram feed ratio) */
const MYSTIC_ASPECT: Record<string, string> = {
  feed:        "social_post_4_5",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

/**
 * Seedream V5 Lite does not have social_post_4_5 (exact Instagram 4:5).
 * traditional_3_4 (1774×2364, ratio 0.75) is the closest portrait option for feed.
 * social_story_9_16 (1536×2730) is an exact match for stories/reels.
 */
const SEEDREAM_ASPECT: Record<string, string> = {
  feed:        "traditional_3_4",
  stories:     "social_story_9_16",
  reels_cover: "social_story_9_16",
};

export function freepikAspect(format: string, provider: "mystic" | "seedream" = "mystic"): string {
  const map = provider === "seedream" ? SEEDREAM_ASPECT : MYSTIC_ASPECT;
  return map[format] ?? "square_1_1";
}

// ═══════════════════════════════════════════════════════════════════════════
// MYSTIC
// ═══════════════════════════════════════════════════════════════════════════

export interface FreepikGenerateParams {
  prompt:        string;
  aspect_ratio:  string;
  realism?:      boolean;
  image?:        string;
  image_weight?: number;
  styling?:      { colors: { color: string; weight: number }[] };
}

/** Creates a Mystic generation task (txt2img or img2img). */
export async function createTask(params: FreepikGenerateParams): Promise<FreepikTask> {
  const res = await freepikFetch(MYSTIC_BASE, {
    method: "POST",
    body:   JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik Mystic error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data    = await res.json();
  const task_id = data.data?.task_id as string | undefined;
  if (!task_id) throw new Error("task_id não retornado pela Freepik Mystic");

  return { task_id };
}

/** Polls a Mystic task. */
export async function pollTask(task_id: string): Promise<FreepikTaskResult> {
  const res = await freepikFetch(`${MYSTIC_BASE}/${task_id}`, { method: "GET" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik Mystic poll error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data   = await res.json();
  const status = (data.data?.status ?? "PENDING") as FreepikTaskStatus;

  if (status === "COMPLETED") {
    const generated = data.data?.generated;
    const image_url = Array.isArray(generated) ? (generated[0] as string) : null;
    return { status, image_url, raw: data };
  }

  return { status, image_url: null, raw: data };
}

// ═══════════════════════════════════════════════════════════════════════════
// SEEDREAM V5 LITE
// ═══════════════════════════════════════════════════════════════════════════

export interface SeedreamGenerateParams {
  prompt:                 string;
  aspect_ratio?:          string;
  seed?:                  number;
  enable_safety_checker?: boolean;
}

export interface SeedreamEditParams extends SeedreamGenerateParams {
  /** 1–5 items: base64 strings or publicly accessible image URLs. */
  reference_images: string[];
}

/** Creates a Seedream V5 Lite txt2img task. */
export async function createSeedreamTask(params: SeedreamGenerateParams): Promise<FreepikTask> {
  const res = await freepikFetch(SEEDREAM_BASE, {
    method: "POST",
    body:   JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik Seedream error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data    = await res.json();
  const task_id = data.data?.task_id as string | undefined;
  if (!task_id) throw new Error("task_id não retornado pela Freepik Seedream");

  return { task_id };
}

/** Creates a Seedream V5 Lite Edit img2img task. */
export async function createSeedreamEditTask(params: SeedreamEditParams): Promise<FreepikTask> {
  const res = await freepikFetch(SEEDREAM_EDIT, {
    method: "POST",
    body:   JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik Seedream Edit error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data    = await res.json();
  const task_id = data.data?.task_id as string | undefined;
  if (!task_id) throw new Error("task_id não retornado pela Freepik Seedream Edit");

  return { task_id };
}

/** Polls a Seedream task (uses the seedream-v5-lite base endpoint). */
export async function pollSeedreamTask(task_id: string): Promise<FreepikTaskResult> {
  const res = await freepikFetch(`${SEEDREAM_BASE}/${task_id}`, { method: "GET" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik Seedream poll error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data   = await res.json();
  const status = (data.data?.status ?? "PENDING") as FreepikTaskStatus;

  if (status === "COMPLETED") {
    const generated = data.data?.generated;
    const image_url = Array.isArray(generated) ? (generated[0] as string) : null;
    return { status, image_url, raw: data };
  }

  return { status, image_url: null, raw: data };
}
