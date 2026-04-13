/**
 * lib/tavily.ts
 *
 * Busca tendências em tempo real via Tavily Search API.
 * Usada pelo Estrategista para enriquecer o briefing com contexto atual do mercado.
 *
 * Env:
 *   TAVILY_API_KEY  — obrigatório para chamadas reais
 *
 * Se a chave não estiver configurada, todas as funções retornam null silenciosamente.
 * O Estrategista continua funcionando sem contexto de tendências (degradação graciosa).
 *
 * Custo estimado: ~$0.01 por busca (Free tier: 1.000 buscas/mês)
 */

import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface TavilySearchResult {
  title:   string;
  url:     string;
  content: string;
  score:   number;
}

interface TavilySearchResponse {
  results:       TavilySearchResult[];
  answer?:       string;
  query:         string;
  response_time: number;
}

export interface TrendContext {
  query:    string;
  summary:  string;   // resumo curado das top tendências (≤300 chars)
  snippets: string[]; // até 3 snippets relevantes
}

/** True se Tavily está configurado */
export function isTavilyEnabled(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Busca notícias e tendências B2B para LinkedIn — mercado, setor, negócios.
 *
 * Foco em: insights de mercado, notícias do setor, tendências profissionais.
 * Usado pelo Estrategista LinkedIn para gerar thought leadership relevante.
 */
export async function fetchLinkedInTrendContext(
  segment: string,
  focus?:  string,
): Promise<TrendContext | null> {
  if (!isTavilyEnabled()) return null;

  const apiKey = process.env.TAVILY_API_KEY!;

  const query = focus
    ? `tendências mercado ${segment} ${focus} Brasil 2025 B2B LinkedIn negócios`
    : `notícias tendências ${segment} Brasil 2025 mercado profissional insights`;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth:         "basic",
        max_results:          5,
        include_answer:       true,
        include_raw_content:  false,
        topic:                "news",    // foco em notícias recentes para LinkedIn
      }),
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      console.warn(`[tavily/linkedin] HTTP ${res.status} — continuando sem tendências`);
      return null;
    }

    const data = await res.json() as TavilySearchResponse;

    const goodResults = data.results
      .filter(r => r.score > 0.4)
      .slice(0, 3);

    if (!goodResults.length && !data.answer) return null;

    const summaryParts: string[] = [];
    if (data.answer) summaryParts.push(data.answer.slice(0, 250));

    const snippets = goodResults.map(r =>
      `• ${r.title}: ${r.content.slice(0, 120).replace(/\n/g, " ")}`
    );

    const summary = summaryParts.join(" ") || snippets.slice(0, 1).join("");

    return { query, summary: summary.slice(0, 300), snippets };
  } catch (e) {
    console.warn("[tavily/linkedin] Falha na busca (non-fatal):", e);
    return null;
  }
}

/**
 * Busca tendências relevantes para o segmento da marca no Instagram/redes sociais.
 *
 * @param segment     Segmento da marca (ex: "restaurante gourmet", "academia")
 * @param focus       Foco de campanha opcional (ex: "Dia dos Namorados")
 * @returns TrendContext com resumo de tendências, ou null se Tavily não disponível
 */
export async function fetchTrendContext(
  segment: string,
  focus?:  string,
): Promise<TrendContext | null> {
  if (!isTavilyEnabled()) return null;

  const apiKey = process.env.TAVILY_API_KEY!;

  // Monta query focada em tendências brasileiras do segmento
  const query = focus
    ? `tendências Instagram marketing ${segment} ${focus} Brasil 2025`
    : `tendências conteúdo Instagram ${segment} Brasil 2025`;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        search_depth:         "basic",    // basic=barato e rápido, advanced=mais profundo
        max_results:          5,
        include_answer:       true,       // Tavily gera um summary automático
        include_raw_content:  false,
        topic:                "general",
      }),
      signal: AbortSignal.timeout(6_000),
    });

    if (!res.ok) {
      console.warn(`[tavily] HTTP ${res.status} — continuando sem tendências`);
      return null;
    }

    const data = await res.json() as TavilySearchResponse;

    // Filtra resultados com score razoável
    const goodResults = data.results
      .filter(r => r.score > 0.4)
      .slice(0, 3);

    if (!goodResults.length && !data.answer) return null;

    // Monta resumo: usa o answer automático do Tavily + snippets dos melhores resultados
    const summaryParts: string[] = [];
    if (data.answer) summaryParts.push(data.answer.slice(0, 250));

    const snippets = goodResults.map(r =>
      `• ${r.title}: ${r.content.slice(0, 120).replace(/\n/g, " ")}`
    );

    const summary = summaryParts.join(" ") || snippets.slice(0, 1).join("");

    return { query, summary: summary.slice(0, 300), snippets };
  } catch (e) {
    console.warn("[tavily] Falha na busca (non-fatal):", e);
    return null;
  }
}

/**
 * Reads trend cache for a client from today's Firestore document.
 * Returns null if no cache exists for today.
 */
export async function readTrendCache(
  client_id: string,
  social: "instagram" | "linkedin",
): Promise<TrendContext | null> {
  const date = new Date().toISOString().split("T")[0];
  const docId = `${client_id}_${social}_${date}`;

  try {
    const snap = await adminDb.collection("trend_cache").doc(docId).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    return {
      query:    data.query    as string,
      summary:  data.summary  as string,
      snippets: data.snippets as string[],
    };
  } catch (e) {
    console.warn(`[tavily/cache] Falha ao ler cache ${docId} (non-fatal):`, e);
    return null;
  }
}

/**
 * Writes trend data to Firestore cache for today.
 */
export async function writeTrendCache(
  client_id: string,
  social: "instagram" | "linkedin",
  trend: TrendContext,
  agency_id: string,
): Promise<void> {
  const date = new Date().toISOString().split("T")[0];
  const docId = `${client_id}_${social}_${date}`;

  try {
    await adminDb.collection("trend_cache").doc(docId).set(
      {
        client_id,
        social,
        query:      trend.query,
        summary:    trend.summary,
        snippets:   trend.snippets,
        agency_id,
        created_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  } catch (e) {
    console.warn(`[tavily/cache] Falha ao gravar cache ${docId} (non-fatal):`, e);
  }
}
