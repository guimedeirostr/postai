/**
 * lib/depth-compositor.ts
 *
 * Efeito "texto atrás do sujeito" usando mapa de profundidade MiDaS.
 *
 * Fluxo:
 *   1. Recebe a imagem composta (com texto sobreposto pelo Sharp)
 *   2. Recebe a foto original e o depth map do MiDaS (grayscale)
 *   3. Threshold no depth map → máscara de foreground (sujeito próximo = branco)
 *   4. Extrai os pixels do sujeito da foto original com a máscara
 *   5. Compõe o sujeito SOBRE a imagem-com-texto → texto fica atrás do sujeito
 *
 * Convenção MiDaS: pixels BRANCOS = próximos da câmera (foreground)
 *                   pixels PRETOS  = longe da câmera  (background)
 *
 * Threshold padrão: 150/255 — captura bem sujeitos nítidos em frente ao fundo.
 * Aumente para máscaras mais conservadoras; diminua para incluir mais do sujeito.
 */

/** Aplica o efeito de profundidade: texto composto aparece atrás do sujeito. */
export async function applyDepthEffect(
  composedBuffer:   Buffer,
  originalPhotoUrl: string,
  depthMapUrl:      string,
  threshold:        number = 150,
): Promise<Buffer> {
  const { default: sharp } = await import("sharp");

  // ── Dimensões da imagem composta ─────────────────────────────────────────
  const meta = await sharp(composedBuffer).metadata();
  const W    = meta.width  ?? 1080;
  const H    = meta.height ?? 1350;

  // ── Download paralelo: foto original + depth map ──────────────────────────
  const [origRes, depthRes] = await Promise.all([
    fetch(originalPhotoUrl, { signal: AbortSignal.timeout(10_000) }),
    fetch(depthMapUrl,      { signal: AbortSignal.timeout(10_000) }),
  ]);

  if (!origRes.ok || !depthRes.ok) {
    console.warn("[depth-compositor] Falha ao baixar foto/depth map — efeito ignorado");
    return composedBuffer;
  }

  const [origBuf, depthBuf] = await Promise.all([
    origRes.arrayBuffer().then(Buffer.from),
    depthRes.arrayBuffer().then(Buffer.from),
  ]);

  // ── Depth map → máscara binária (foreground branco, background preto) ─────
  // 1. Redimensiona depth map para o tamanho da composição
  // 2. Converte para grayscale
  // 3. Threshold: pixels >= threshold → 255 (branco = foreground)
  // 4. Blur suave para suavizar bordas do sujeito
  const maskBuf = await sharp(depthBuf)
    .resize(W, H, { fit: "cover" })
    .grayscale()
    .threshold(threshold)      // binariza: ≥threshold=255, <threshold=0
    .blur(4)                   // suaviza bordas para blend natural
    .toBuffer();

  // ── Foto original redimensionada (mesmas dims da composição) ─────────────
  const origResized = await sharp(origBuf)
    .resize(W, H, { fit: "cover" })
    .toBuffer();

  // ── Extrai apenas o foreground da foto original (apply mask as alpha) ────
  // sharp composite com blend "dest-in" mantém pixels da imagem base
  // onde a máscara é branca (opaca) e descarta onde é preta.
  const foregroundPng = await sharp(origResized)
    .composite([{
      input:  maskBuf,
      blend:  "dest-in",   // mantém pixels onde máscara é opaca
    }])
    .png()
    .toBuffer();

  // ── Compõe: (texto + fundo) ABAIXO do foreground (sujeito) ───────────────
  const result = await sharp(composedBuffer)
    .composite([{
      input: foregroundPng,
      blend: "over",       // sujeito cobre o texto na área da máscara
    }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
}
