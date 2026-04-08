/**
 * lib/chromium-renderer.ts
 *
 * Cliente do serviço de renderização Chromium (Railway/Fly.io).
 * Recebe HTML/CSS preenchido e retorna buffer JPEG pronto para upload no R2.
 *
 * Env vars:
 *   RENDERER_URL     — URL do serviço (ex: https://postai-renderer.railway.app)
 *   RENDERER_SECRET  — token de autenticação (mesma var no server)
 */

export function isRendererEnabled(): boolean {
  return !!process.env.RENDERER_URL;
}

/**
 * Renderiza um HTML template com Chrome real e retorna o buffer JPEG.
 * Lança erro se o serviço não estiver disponível ou retornar falha.
 */
export async function renderHtml(
  html:   string,
  format: "feed" | "stories" | "reels_cover" = "feed",
): Promise<Buffer> {
  const url = process.env.RENDERER_URL;
  if (!url) throw new Error("[chromium-renderer] RENDERER_URL não configurada");

  const W = 1080;
  const H = format === "feed" ? 1350 : 1920;

  const res = await fetch(`${url}/render`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      width:  W,
      height: H,
      secret: process.env.RENDERER_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`[chromium-renderer] Render falhou: ${res.status} — ${err}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Health check do serviço de renderização.
 */
export async function checkRendererHealth(): Promise<boolean> {
  const url = process.env.RENDERER_URL;
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}
