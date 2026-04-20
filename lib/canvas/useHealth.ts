"use client";

import { useEffect, useState } from "react";
import type { ServiceHealth } from "@/lib/env";

export type { ServiceHealth };

/** Human-readable env-var label shown in UI banners per service. */
export const SERVICE_ENV_LABEL: Record<keyof ServiceHealth, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  replicate: "REPLICATE_API_KEY",
  r2:        "CF_R2_ACCOUNT_ID / CF_R2_ACCESS_KEY_ID / CF_R2_SECRET_ACCESS_KEY",
  google:    "GOOGLE_AI_API_KEY",
  fal:       "FALAI_API_KEY",
  freepik:   "FREEPIK_API_KEY",
};

export interface HealthState {
  services:  ServiceHealth | null;
  isLoading: boolean;
}

// Module-level cache: only one fetch per browser session regardless of how many nodes mount
let cached: ServiceHealth | null = null;
let inflightPromise: Promise<ServiceHealth> | null = null;

async function fetchHealth(): Promise<ServiceHealth> {
  if (inflightPromise) return inflightPromise;

  inflightPromise = fetch("/api/health", { cache: "no-store" })
    .then(r => {
      if (!r.ok) throw new Error("health check failed");
      return r.json();
    })
    .then((body: { services: ServiceHealth }) => {
      cached = body.services;
      return body.services;
    })
    .catch(() => {
      // Don't block the UI if health check fails — assume services are available
      inflightPromise = null;
      return null as unknown as ServiceHealth;
    });

  return inflightPromise;
}

/**
 * Returns the server's service health.
 * - `isLoading: true` while the first fetch is in flight (no false negatives shown)
 * - Results are module-cached; only one request per page load
 */
export function useHealth(): HealthState {
  const [services, setServices] = useState<ServiceHealth | null>(cached);
  const [isLoading, setIsLoading] = useState(cached === null);

  useEffect(() => {
    if (cached !== null) {
      setServices(cached);
      setIsLoading(false);
      return;
    }
    fetchHealth().then(h => {
      setServices(h);
      setIsLoading(false);
    });
  }, []);

  return { services, isLoading };
}

/** True only when we're confident the service is missing (not while loading). */
export function useServiceMissing(service: keyof ServiceHealth | undefined): boolean {
  const { services, isLoading } = useHealth();
  if (!service || isLoading || services === null) return false;
  return !services[service];
}
