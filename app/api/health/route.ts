import { NextResponse } from "next/server";
import { getServiceHealth } from "@/lib/env";
import type { ServiceHealth } from "@/lib/env";

export interface HealthResponse {
  ok:       boolean;
  services: ServiceHealth;
  missing:  string[];
}

export async function GET() {
  const services = getServiceHealth();
  const missing  = (Object.keys(services) as (keyof ServiceHealth)[])
    .filter(k => !services[k]);

  return NextResponse.json(
    { ok: missing.length === 0, services, missing } satisfies HealthResponse,
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag":  "noindex",
      },
    },
  );
}
