/**
 * GET /api/jobs/worker
 *
 * Vercel Cron endpoint — executa a cada minuto (vercel.json).
 * Busca até BATCH_SIZE jobs com status "queued" via collection group,
 * reclama cada um atomicamente e processa em paralelo.
 *
 * Auth: header Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { claimJob } from "@/lib/jobs/queue";
import { processJob } from "@/lib/jobs/worker";
import type { GenerationJob } from "@/types";

export const maxDuration = 300; // 5 min (Vercel Pro required for > 60s)

const BATCH_SIZE = 5;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === secret;
}

function pathParts(docPath: string): { uid: string; clientId: string } | null {
  // path: "users/{uid}/clients/{cid}/generationJobs/{jobId}"
  const parts = docPath.split("/");
  if (parts.length < 6) return null;
  return { uid: parts[1], clientId: parts[3] };
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Collection group query across all users
    const snap = await adminDb
      .collectionGroup("generationJobs")
      .where("status", "==", "queued")
      .orderBy("createdAt", "asc")
      .limit(BATCH_SIZE)
      .get();

    if (snap.empty) {
      return NextResponse.json({ processed: 0, message: "Nenhum job na fila" });
    }

    const results: Array<{ jobId: string; status: "ok" | "skipped" | "error"; error?: string }> = [];

    await Promise.all(
      snap.docs.map(async doc => {
        const parts = pathParts(doc.ref.path);
        if (!parts) {
          results.push({ jobId: doc.id, status: "skipped" });
          return;
        }

        const { uid, clientId } = parts;

        // Atomic claim: queued → running
        const job = await claimJob(uid, clientId, doc.id);
        if (!job) {
          results.push({ jobId: doc.id, status: "skipped" });
          return;
        }

        try {
          await processJob(uid, clientId, { ...doc.data() as GenerationJob, id: doc.id });
          results.push({ jobId: doc.id, status: "ok" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro desconhecido";
          results.push({ jobId: doc.id, status: "error", error: msg });
        }
      })
    );

    const ok      = results.filter(r => r.status === "ok").length;
    const errored = results.filter(r => r.status === "error").length;

    return NextResponse.json({ processed: ok, errors: errored, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[jobs/worker]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
