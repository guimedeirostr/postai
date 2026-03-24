/**
 * Freepik API client with retry logic for transient errors (5xx, network failures).
 * 401 errors are surfaced immediately with a clear message — they indicate an
 * invalid or expired API key and cannot be recovered by retrying.
 */

const FREEPIK_API_KEY = () => process.env.FREEPIK_API_KEY ?? "";
const FREEPIK_BASE    = "https://api.freepik.com/v1/ai/mystic";

const MAX_RETRIES   = 3;
const RETRY_DELAY_MS = 1500;

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

  // Auth error — no point retrying
  if (res.status === 401) {
    const body = await res.json().catch(() => ({}));
    throw new FreepikAuthError(
      `Freepik API key inválida ou expirada (401). Verifique FREEPIK_API_KEY.`,
      body
    );
  }

  // Transient server error — retry with back-off
  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY_MS * attempt);
    return freepikFetch(url, init, attempt + 1);
  }

  return res;
}

export class FreepikAuthError extends Error {
  constructor(message: string, public readonly details: unknown) {
    super(message);
    this.name = "FreepikAuthError";
  }
}

export interface FreepikGenerateParams {
  prompt:       string;
  aspect_ratio: string;
  realism?:     boolean;
  image?:       string;
  image_weight?: number;
  styling?:     { colors: { color: string; weight: number }[] };
}

export interface FreepikTask {
  task_id: string;
}

/**
 * Creates a new Mystic generation task (txt2img or img2img).
 * Returns the task_id to poll with `pollTask`.
 */
export async function createTask(params: FreepikGenerateParams): Promise<FreepikTask> {
  const res = await freepikFetch(FREEPIK_BASE, {
    method: "POST",
    body:   JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik error ${res.status}: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const task_id = data.data?.task_id as string | undefined;
  if (!task_id) throw new Error("task_id não retornado pela Freepik");

  return { task_id };
}

export type FreepikTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED";

export interface FreepikTaskResult {
  status:    FreepikTaskStatus;
  image_url: string | null;
  raw?:      unknown;
}

/**
 * Polls the status of an existing Mystic task.
 */
export async function pollTask(task_id: string): Promise<FreepikTaskResult> {
  const res = await freepikFetch(`${FREEPIK_BASE}/${task_id}`, { method: "GET" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Freepik poll error ${res.status}: ${JSON.stringify(err)}`);
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
