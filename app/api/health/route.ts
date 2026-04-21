import { NextResponse } from "next/server";
import { getServiceHealth, getFeatureFlags } from "@/lib/env";
import type { ServiceHealth, FeatureFlags } from "@/lib/env";

export interface HealthResponse {
  ok:       boolean;
  services: ServiceHealth;
  missing:  string[];
  flags:    FeatureFlags;
}

export async function GET() {
  const services = getServiceHealth();
  const flags    = getFeatureFlags();
  const missing  = (Object.keys(services) as (keyof ServiceHealth)[])
    .filter(k => !services[k]);

  return NextResponse.json(
    { ok: missing.length === 0, services, missing, flags } satisfies HealthResponse,
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag":  "noindex",
      },
    },
  );
}
