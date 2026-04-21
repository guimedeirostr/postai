import type { TraceEmitter } from "@/types";

export type { TraceEmitter };

// Anthropic model pricing per 1K tokens (USD) — update as pricing changes
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 0.0008, out: 0.004 },
  "claude-haiku-4-5":          { in: 0.0008, out: 0.004 },
  "claude-sonnet-4-6":         { in: 0.003,  out: 0.015 },
  "claude-opus-4-7":           { in: 0.015,  out: 0.075 },
  "claude-opus-4-5":           { in: 0.015,  out: 0.075 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price =
    PRICES[model] ??
    Object.entries(PRICES).find(([k]) => model.startsWith(k.slice(0, 14)))?.[1] ??
    PRICES["claude-haiku-4-5-20251001"];
  return (inputTokens * price.in + outputTokens * price.out) / 1000;
}
