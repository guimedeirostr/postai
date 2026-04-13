/**
 * lib/google-fonts.ts
 *
 * Server-side client para a Google Fonts Developer API.
 * Requer env: GOOGLE_FONTS_API_KEY (pode ser o mesmo que GOOGLE_VISION_API_KEY / GEMINI_API_KEY
 * desde que a API "Web Fonts Developer API" esteja habilitada no projeto Google Cloud).
 *
 * Cache em memória: TTL 24h (lista de fontes muda raramente).
 */

export interface GoogleFont {
  family:   string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
  variants: string[];  // ["regular", "italic", "700", "700italic", ...]
  subsets:  string[];
}

interface FontsApiResponse {
  items: Array<{
    family:   string;
    category: string;
    variants: string[];
    subsets:  string[];
  }>;
}

// ── Memory cache ──────────────────────────────────────────────────────────────

let cachedFonts:    GoogleFont[] | null = null;
let cacheExpiresAt: number              = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchGoogleFonts(opts?: {
  sort?: "popularity" | "alpha" | "date" | "trending";
}): Promise<GoogleFont[]> {
  const now = Date.now();
  if (cachedFonts && now < cacheExpiresAt) return cachedFonts;

  const apiKey = process.env.GOOGLE_FONTS_API_KEY
    ?? process.env.GOOGLE_VISION_API_KEY
    ?? process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Nenhuma chave Google encontrada. Configure GOOGLE_FONTS_API_KEY no .env.local");
  }

  const sort   = opts?.sort ?? "popularity";
  const url    = `https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=${sort}`;
  const res    = await fetch(url, { next: { revalidate: 86400 } });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Google Fonts API error ${res.status}: ${txt}`);
  }

  const json  = await res.json() as FontsApiResponse;
  const fonts = json.items.map(f => ({
    family:   f.family,
    category: f.category as GoogleFont["category"],
    variants: f.variants,
    subsets:  f.subsets,
  }));

  cachedFonts    = fonts;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return fonts;
}

// ── Build Google Fonts CDN URL (no API key — public CDN) ──────────────────────

/**
 * Constrói a URL do CSS do Google Fonts para carregar no browser ou no Chromium renderer.
 * Ex: buildGoogleFontsUrl("Oswald", "Open Sans")
 *   → "https://fonts.googleapis.com/css2?family=Oswald:wght@400;700;900&family=Open+Sans:wght@400;500;700&display=swap"
 */
export function buildGoogleFontsUrl(headlineFont: string, bodyFont?: string): string {
  const encode = (f: string) => f.trim().replace(/ /g, "+");
  const headline = `family=${encode(headlineFont)}:wght@400;700;900`;
  const body     = bodyFont && bodyFont !== headlineFont
    ? `&family=${encode(bodyFont)}:wght@400;500;700`
    : "";
  return `https://fonts.googleapis.com/css2?${headline}${body}&display=swap`;
}
