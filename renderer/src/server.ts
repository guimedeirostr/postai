/**
 * PostAI Renderer Service
 *
 * Express server que recebe um HTML/CSS template + dados da marca,
 * renderiza com Puppeteer (Chrome real) e retorna JPEG profissional.
 *
 * Deploy: Railway ou Fly.io
 * Porta: 3000 (configurável via PORT env)
 *
 * ── Browser Pool ─────────────────────────────────────────────────────────────
 * Em vez de um singleton simples (risco de travar em produção), mantemos um
 * pool de até POOL_SIZE browsers com health check periódico.
 * - Cada request pega um browser do pool (ou aguarda em fila).
 * - Browsers mortos são recriados automaticamente.
 * - Auto-restart a cada RECYCLE_INTERVAL ms para limpar vazamentos de memória.
 */

import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer, { Browser } from "puppeteer";

const app  = express();
const PORT = process.env.PORT ?? 3000;

const RENDERER_SECRET    = process.env.RENDERER_SECRET ?? "";
const POOL_SIZE          = Number(process.env.BROWSER_POOL_SIZE ?? 2);
const RECYCLE_INTERVAL   = Number(process.env.BROWSER_RECYCLE_MS ?? 10 * 60 * 1000); // 10 min
const RENDER_TIMEOUT     = Number(process.env.RENDER_TIMEOUT_MS  ?? 25_000);
const MAX_CONCURRENT     = POOL_SIZE * 3; // max requests enfileirados antes de rejeitar

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// ── Argumenos comuns de lançamento ────────────────────────────────────────────
const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--font-render-hinting=none",
  "--disable-extensions",
  "--disable-background-timer-throttling",
];

// ── Browser Pool ──────────────────────────────────────────────────────────────
interface PoolEntry {
  browser:    Browser;
  busy:       boolean;
  renderedAt: number; // timestamp do último render
  recycleAt:  number; // timestamp em que deve ser reciclado
}

const pool: PoolEntry[] = [];
let pendingRequests = 0;

async function launchBrowser(): Promise<Browser> {
  const b = await puppeteer.launch({ headless: true, args: CHROME_ARGS });
  console.log("[pool] Novo browser lançado");
  return b;
}

async function initPool(): Promise<void> {
  for (let i = 0; i < POOL_SIZE; i++) {
    const browser = await launchBrowser();
    pool.push({
      browser,
      busy:       false,
      renderedAt: Date.now(),
      recycleAt:  Date.now() + RECYCLE_INTERVAL,
    });
  }
  console.log(`[pool] Pool inicializado com ${POOL_SIZE} browsers`);
}

/** Retorna um browser livre do pool (aguarda até ter um disponível) */
async function acquireBrowser(): Promise<{ entry: PoolEntry; release: () => void }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Pool timeout: sem browsers disponíveis")), 30_000);

    function tryAcquire() {
      // Reciclar browsers vencidos que não estão busy
      for (const entry of pool) {
        if (!entry.busy && Date.now() > entry.recycleAt) {
          entry.browser.close().catch(() => {});
          launchBrowser().then(b => {
            entry.browser = b;
            entry.recycleAt = Date.now() + RECYCLE_INTERVAL;
            console.log("[pool] Browser reciclado (TTL expirado)");
          }).catch(err => console.error("[pool] Falha ao reciclar browser:", err));
        }
      }

      // Encontrar um livre e saudável
      const entry = pool.find(e => !e.busy && e.browser.connected);
      if (entry) {
        clearTimeout(timeout);
        entry.busy = true;
        const release = () => {
          entry.busy = false;
          entry.renderedAt = Date.now();
        };
        resolve({ entry, release });
      } else {
        // Reconectar browsers desconectados que não estão busy
        for (const entry of pool) {
          if (!entry.busy && !entry.browser.connected) {
            launchBrowser().then(b => {
              entry.browser = b;
              entry.recycleAt = Date.now() + RECYCLE_INTERVAL;
              console.log("[pool] Browser reconectado (estava desconectado)");
              tryAcquire();
            }).catch(err => {
              console.error("[pool] Falha ao reconectar browser:", err);
            });
            return;
          }
        }
        // Todos busy — aguardar 200ms e tentar de novo
        setTimeout(tryAcquire, 200);
      }
    }

    tryAcquire();
  });
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  const status = pool.map((e, i) => ({
    index:     i,
    busy:      e.busy,
    connected: e.browser.connected,
    recycleIn: Math.round((e.recycleAt - Date.now()) / 1000) + "s",
  }));
  res.json({
    status:   "ok",
    service:  "postai-renderer",
    pool:     status,
    pending:  pendingRequests,
  });
});

// ── POST /render ──────────────────────────────────────────────────────────────
app.post("/render", async (req: Request, res: Response) => {
  // Auth check
  if (RENDERER_SECRET && req.body.secret !== RENDERER_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Backpressure: rejeitar se fila muito cheia
  if (pendingRequests >= MAX_CONCURRENT) {
    res.status(503).json({ error: "Renderer sobrecarregado, tente novamente" });
    return;
  }

  pendingRequests++;

  const {
    html,
    width  = 1080,
    height = 1350,
  } = req.body as {
    html:    string;
    width?:  number;
    height?: number;
    secret?: string;
  };

  if (!html) {
    pendingRequests--;
    res.status(400).json({ error: "html é obrigatório" });
    return;
  }

  let acquired: { entry: PoolEntry; release: () => void } | null = null;

  try {
    acquired = await acquireBrowser();
    const page = await acquired.entry.browser.newPage();

    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      // networkidle2 garante que Google Fonts e imagens externas carregaram
      await page.setContent(html, {
        waitUntil: "networkidle2",
        timeout:   RENDER_TIMEOUT,
      });

      // Aguarda fonts.ready (critical para fontes do Google Fonts serem renderizadas)
      await page.evaluate(() => document.fonts.ready);

      const screenshot = await page.screenshot({
        type:    "jpeg",
        quality: 95,
        clip:    { x: 0, y: 0, width, height },
      });

      res.set("Content-Type",   "image/jpeg");
      res.set("X-Render-Width", String(width));
      res.set("X-Render-Height",String(height));
      res.send(Buffer.from(screenshot));

    } finally {
      await page.close().catch(() => {});
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Render error";
    console.error("[renderer] Error:", message);
    res.status(500).json({ error: message });
  } finally {
    acquired?.release();
    pendingRequests--;
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
initPool().then(() => {
  app.listen(PORT, () => {
    console.log(`[postai-renderer] Running on port ${PORT} — pool=${POOL_SIZE}`);
  });
}).catch(err => {
  console.error("[postai-renderer] Falha ao inicializar pool:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[postai-renderer] SIGTERM recebido, fechando browsers...");
  await Promise.allSettled(pool.map(e => e.browser.close()));
  process.exit(0);
});
