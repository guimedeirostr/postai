/**
 * PostAI Renderer Service
 *
 * Express server que recebe um HTML/CSS template + dados da marca,
 * renderiza com Puppeteer (Chrome real) e retorna JPEG profissional.
 *
 * Deploy: Railway ou Fly.io
 * Porta: 3000 (configurável via PORT env)
 */

import express, { Request, Response } from "express";
import cors from "cors";
import puppeteer, { Browser } from "puppeteer";

const app  = express();
const PORT = process.env.PORT ?? 3000;

// ── Autenticação simples por token ────────────────────────────────────────────
const RENDERER_SECRET = process.env.RENDERER_SECRET ?? "";

app.use(cors());
app.use(express.json({ limit: "20mb" }));

// ── Browser pool (singleton reutilizado entre requests) ───────────────────────
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  });
  browser.on("disconnected", () => { browser = null; });
  return browser;
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "postai-renderer" });
});

// ── POST /render ──────────────────────────────────────────────────────────────
// Body: { html: string, width?: number, height?: number, secret?: string }
// Response: JPEG buffer
app.post("/render", async (req: Request, res: Response) => {
  try {
    // Auth check
    if (RENDERER_SECRET && req.body.secret !== RENDERER_SECRET) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

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
      res.status(400).json({ error: "html é obrigatório" });
      return;
    }

    const b    = await getBrowser();
    const page = await b.newPage();

    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });

      // waitUntil networkidle2 garante que fontes do Google Fonts carregaram
      await page.setContent(html, { waitUntil: "networkidle2", timeout: 20_000 });

      // Aguarda fontes renderizarem (document.fonts.ready)
      await page.evaluate(() => document.fonts.ready);

      const screenshot = await page.screenshot({
        type:    "jpeg",
        quality: 95,
        clip: { x: 0, y: 0, width, height },
      });

      res.set("Content-Type", "image/jpeg");
      res.set("X-Render-Width",  String(width));
      res.set("X-Render-Height", String(height));
      res.send(Buffer.from(screenshot));

    } finally {
      await page.close();
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Render error";
    console.error("[renderer] Error:", message);
    res.status(500).json({ error: message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[postai-renderer] Running on port ${PORT}`);
  // Pré-aquecer o browser
  getBrowser().then(() => console.log("[postai-renderer] Browser ready"));
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  if (browser) await browser.close();
  process.exit(0);
});
