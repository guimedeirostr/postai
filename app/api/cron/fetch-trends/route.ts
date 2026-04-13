/**
 * GET /api/cron/fetch-trends
 *
 * Cron endpoint that proactively fetches trends for ALL active clients and
 * persists the results to Firestore (`trend_cache` collection).
 *
 * Authentication: x-cron-secret header must match CRON_SECRET env var.
 *
 * Intended to run once per day (e.g. via Vercel Cron or an external scheduler).
 * maxDuration is set to 300 s to accommodate large agencies.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import {
  fetchTrendContext,
  fetchLinkedInTrendContext,
  writeTrendCache,
} from "@/lib/tavily";

export const maxDuration = 300; // 5 minutes

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Load all clients ──────────────────────────────────────────────────────
  let clientDocs;
  try {
    const snap = await adminDb.collection("clients").get();
    clientDocs = snap.docs;
  } catch (e) {
    console.error("[cron/fetch-trends] Failed to load clients:", e);
    return NextResponse.json({ error: "Failed to load clients" }, { status: 500 });
  }

  console.log(`[cron/fetch-trends] Processing ${clientDocs.length} clients`);

  let processed = 0;
  let errors = 0;

  // ── Process clients sequentially to avoid rate-limiting Tavily ────────────
  for (const doc of clientDocs) {
    const client = doc.data() as {
      segment:   string;
      agency_id: string;
    };
    const client_id = doc.id;

    console.log(`[cron/fetch-trends] Fetching trends for client ${client_id} (${client.segment})`);

    const results = await Promise.allSettled([
      // Instagram
      (async () => {
        const trend = await fetchTrendContext(client.segment, undefined);
        if (trend) {
          await writeTrendCache(client_id, "instagram", trend, client.agency_id);
          console.log(`[cron/fetch-trends] ✓ instagram cached for ${client_id}`);
        } else {
          console.warn(`[cron/fetch-trends] No instagram trend returned for ${client_id}`);
        }
      })(),
      // LinkedIn
      (async () => {
        const trend = await fetchLinkedInTrendContext(client.segment, undefined);
        if (trend) {
          await writeTrendCache(client_id, "linkedin", trend, client.agency_id);
          console.log(`[cron/fetch-trends] ✓ linkedin cached for ${client_id}`);
        } else {
          console.warn(`[cron/fetch-trends] No linkedin trend returned for ${client_id}`);
        }
      })(),
    ]);

    // Count outcomes
    let clientHadError = false;
    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          `[cron/fetch-trends] Error processing client ${client_id}:`,
          result.reason,
        );
        clientHadError = true;
      }
    }

    if (clientHadError) {
      errors++;
    } else {
      processed++;
    }

    // Small delay between clients to avoid hammering Tavily
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  console.log(
    `[cron/fetch-trends] Done — processed: ${processed}, errors: ${errors}`,
  );

  return NextResponse.json({ processed, errors });
}
