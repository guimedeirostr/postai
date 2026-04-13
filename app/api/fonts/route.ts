/**
 * GET /api/fonts
 *
 * Retorna lista de fontes do Google Fonts (server-proxy para proteger a chave).
 *
 * Query params:
 *   category  — "all" | "sans-serif" | "serif" | "display" | "handwriting" | "monospace"
 *   q         — busca por nome (case-insensitive substring)
 *   limit     — máximo de fontes retornadas (padrão: 200, max: 1000)
 *   sort      — "popularity" | "alpha" | "trending" (padrão: "popularity")
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchGoogleFonts } from "@/lib/google-fonts";

export const revalidate = 86400; // cache edge 24h

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const category = searchParams.get("category") ?? "all";
    const q        = (searchParams.get("q") ?? "").toLowerCase().trim();
    const limit    = Math.min(parseInt(searchParams.get("limit") ?? "200", 10), 1000);
    const sort     = (searchParams.get("sort") ?? "popularity") as "popularity" | "alpha" | "trending";

    const allFonts = await fetchGoogleFonts({ sort });

    let fonts = allFonts;

    // Filter by category
    if (category && category !== "all") {
      fonts = fonts.filter(f => f.category === category);
    }

    // Filter by search query
    if (q) {
      fonts = fonts.filter(f => f.family.toLowerCase().includes(q));
    }

    // Apply limit
    fonts = fonts.slice(0, limit);

    return NextResponse.json({ fonts, total: fonts.length, ok: true }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro interno";
    console.error("[GET /api/fonts]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
