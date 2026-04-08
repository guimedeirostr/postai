/**
 * GET /api/debug/renderer?client_id=xxx
 *
 * Rota de diagnóstico para verificar:
 * 1. Se RENDERER_URL está configurada
 * 2. Se o serviço de renderização está online
 * 3. Quantos design_examples existem e quais têm html_template
 *
 * APENAS para uso interno em desenvolvimento/diagnóstico.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { getSessionUser } from "@/lib/session";
import { checkRendererHealth } from "@/lib/chromium-renderer";
import type { DesignExample } from "@/types";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client_id = req.nextUrl.searchParams.get("client_id");

  const rendererUrl    = process.env.RENDERER_URL ?? null;
  const rendererSecret = process.env.RENDERER_SECRET ? "SET" : "NOT SET";
  let rendererHealthy  = false;

  if (rendererUrl) {
    rendererHealthy = await checkRendererHealth();
  }

  let designExamples: Array<{
    id: string;
    intent?: string;
    has_html_template: boolean;
    html_template_len: number;
    created_at: string;
  }> = [];

  if (client_id) {
    // Verificar ownership
    const clientDoc = await adminDb.collection("clients").doc(client_id).get();
    if (!clientDoc.exists || clientDoc.data()?.agency_id !== user.uid) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const snap = await adminDb
      .collection("clients").doc(client_id)
      .collection("design_examples")
      .orderBy("created_at", "desc")
      .limit(20)
      .get();

    designExamples = snap.docs.map(d => {
      const data = d.data() as DesignExample & { created_at?: { toDate?: () => Date } };
      const tpl  = data.html_template ?? "";
      return {
        id:                d.id,
        intent:            data.intent,
        has_html_template: tpl.length > 100,
        html_template_len: tpl.length,
        created_at:        data.created_at?.toDate?.()?.toISOString() ?? "unknown",
      };
    });
  }

  return NextResponse.json({
    renderer: {
      url:     rendererUrl,
      secret:  rendererSecret,
      healthy: rendererHealthy,
    },
    design_examples: {
      count:          designExamples.length,
      with_template:  designExamples.filter(e => e.has_html_template).length,
      items:          designExamples,
    },
  });
}
