/**
 * Centralized env-var validation — server-only.
 * Critical vars (ANTHROPIC_API_KEY, JWT_SECRET, Firebase) throw at module-load time
 * so the server never starts in a broken state.
 * Feature vars (REPLICATE, R2, etc.) are optional; missing ones surface via /api/health.
 */
import { z } from "zod";

// ── Schema ────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // === CRITICAL — app cannot function without these ===
  ANTHROPIC_API_KEY:               z.string().min(1, "Configure em .env.local"),
  JWT_SECRET:                      z.string().min(1, "Configure em .env.local"),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, "Configure em .env.local"),

  // === OPTIONAL — needed per feature / provider ===
  ANTHROPIC_MODEL:         z.string().default("claude-haiku-4-5-20251001"),
  REPLICATE_API_KEY:       z.string().optional(),
  CF_R2_ACCOUNT_ID:        z.string().optional(),
  CF_R2_ACCESS_KEY_ID:     z.string().optional(),
  CF_R2_SECRET_ACCESS_KEY: z.string().optional(),
  CF_R2_BUCKET_NAME:       z.string().optional(),
  CF_R2_PUBLIC_URL:        z.string().optional(),
  GOOGLE_AI_API_KEY:       z.string().optional(),
  GOOGLE_FONTS_API_KEY:    z.string().optional(),
  FALAI_API_KEY:           z.string().optional(),
  FREEPIK_API_KEY:         z.string().optional(),
  IMAGE_PROVIDER:          z.string().optional(),
  NEXT_PUBLIC_CANVAS_V4_PLAY_PER_NODE: z.string().optional(),
});

// ── Boot-time validation ───────────────────────────────────────────────────────

let _env: z.infer<typeof envSchema>;

try {
  _env = envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    const lines = (err as z.ZodError<Record<string, unknown>>).issues.map(
      (e: z.ZodIssue) => `  • ${String(e.path[0])}: ${e.message}`,
    );
    // Keep this in English so it's searchable in server logs
    throw new Error(
      `\n\n❌  Missing required environment variables:\n${lines.join("\n")}\n\n` +
      `    Copy .env.example to .env.local and fill in the missing values.\n`,
    );
  }
  throw err;
}

export const env = _env;

// ── Service health ─────────────────────────────────────────────────────────────

export interface ServiceHealth {
  anthropic: boolean;
  replicate: boolean;
  r2:        boolean;
  google:    boolean;
  fal:       boolean;
  freepik:   boolean;
}

export interface FeatureFlags {
  canvasV4PlayPerNode: boolean;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    canvasV4PlayPerNode: _env.NEXT_PUBLIC_CANVAS_V4_PLAY_PER_NODE === "true",
  };
}

export function getServiceHealth(): ServiceHealth {
  return {
    anthropic: !!_env.ANTHROPIC_API_KEY,
    replicate: !!_env.REPLICATE_API_KEY,
    r2: !!(
      _env.CF_R2_ACCOUNT_ID &&
      _env.CF_R2_ACCESS_KEY_ID &&
      _env.CF_R2_SECRET_ACCESS_KEY &&
      _env.CF_R2_BUCKET_NAME
    ),
    google:  !!_env.GOOGLE_AI_API_KEY,
    fal:     !!_env.FALAI_API_KEY,
    freepik: !!_env.FREEPIK_API_KEY,
  };
}
