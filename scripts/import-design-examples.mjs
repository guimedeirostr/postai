/**
 * Script de importação de exemplos de design para um cliente.
 * Roda localmente com acesso direto ao Firestore e Anthropic.
 *
 * Uso:
 *   node scripts/import-design-examples.mjs
 */

import fs        from "fs";
import path      from "path";
import dotenv    from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fileURLToPath } from "url";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CLIENT_ID  = "BagAoMolg2cE47vX3c6q";
const AGENCY_ID  = "bfLvo0ouHiXY9ZmMya7G3JqrHRu2";
const IMAGES_DIR = path.resolve("tmp/examples");
const MODEL      = "claude-opus-4-6";
// ──────────────────────────────────────────────────────────────────────────────

// ─── Carregar credenciais do env ───────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.resolve(__dirname, "..");

// Tenta .env.local primeiro (dotenv lida com valores simples)
let ANTHROPIC_KEY = "";
let SA_JSON       = "";
let PROJECT_ID    = "";

for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
    PROJECT_ID    = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
    // Tenta base64 primeiro (sem problema de multi-linha)
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (b64) SA_JSON = Buffer.from(b64.trim(), "base64").toString("utf-8");
    if (ANTHROPIC_KEY && SA_JSON) { console.log(`📄 Env: ${name}\n`); break; }
  }
}

// Fallback: extrai manualmente do .env.example (JSON multi-linha)
if (!ANTHROPIC_KEY || !SA_JSON) {
  const exPath = path.join(root, ".env.example");
  if (fs.existsSync(exPath)) {
    const raw = fs.readFileSync(exPath, "utf8");

    // Extrai ANTHROPIC_API_KEY
    const antMatch = raw.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (antMatch) ANTHROPIC_KEY = antMatch[1].trim();

    // Extrai NEXT_PUBLIC_FIREBASE_PROJECT_ID
    const projMatch = raw.match(/^NEXT_PUBLIC_FIREBASE_PROJECT_ID=(.+)$/m);
    if (projMatch) PROJECT_ID = projMatch[1].trim();

    // Extrai bloco JSON do service account (tudo entre '=' e próxima seção '#')
    const saStart = raw.indexOf("FIREBASE_SERVICE_ACCOUNT_JSON=");
    const saEnd   = raw.indexOf("\n# ─── IA", saStart);
    if (saStart !== -1 && saEnd !== -1) {
      let block = raw.slice(saStart + "FIREBASE_SERVICE_ACCOUNT_JSON=".length, saEnd).trim();
      if (!block.startsWith("{")) block = "{" + block + "}";
      SA_JSON = block;
    }
    console.log("📄 Env: .env.example\n");
  }
}

if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY não encontrada");
if (!SA_JSON)       throw new Error("Firebase service account não encontrado");

// ─── Firebase Admin ────────────────────────────────────────────────────────────
initializeApp({ credential: cert(JSON.parse(SA_JSON)), projectId: PROJECT_ID });
const db = getFirestore();

// ─── Anthropic ─────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

// ─── Prompt de análise ─────────────────────────────────────────────────────────
const ANALYSIS_PROMPT = `
Analise esta imagem de post do Instagram de uma loja de conveniência/empório.
Retorne SOMENTE um JSON válido (sem markdown, sem explicações) com os campos abaixo.

{
  "visual_prompt": "descrição fotográfica detalhada em INGLÊS: tema, iluminação, cores, estilo, produto em destaque",
  "layout_prompt": "descrição da composição em INGLÊS: posição do texto overlay, estilo do overlay, espaços livres. Termine sempre com: All text overlays are in Brazilian Portuguese (pt-BR).",
  "visual_headline_style": "estilo do headline sobreposto (ex: bold white text on dark overlay, colorful centered title, no text...)",
  "pilar": "um de: Produto | Promoção | Bastidores | Educação | Prova Social | Engajamento | Trend",
  "format": "feed",
  "description": "frase curta em pt-BR descrevendo o que esse exemplo representa como referência visual",
  "color_mood": "paleta de cores dominante em inglês (ex: warm amber tones, green and white, dark dramatic)",
  "composition_zone": "onde fica o espaço para texto: bottom | top | left | right | center | none"
}
`.trim();

// ─── Main ───────────────────────────────────────────────────────────────────────
const files = fs
  .readdirSync(IMAGES_DIR)
  .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

console.log(`📂 ${files.length} imagens encontradas em ${IMAGES_DIR}\n`);

let imported = 0;
let failed   = 0;

for (const file of files) {
  const filePath  = path.join(IMAGES_DIR, file);
  const postId    = path.parse(file).name;
  const source    = `https://www.instagram.com/p/${postId}/`;
  const ext       = path.extname(file).toLowerCase();
  const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  process.stdout.write(`⏳ ${file} ... `);

  try {
    const base64 = fs.readFileSync(filePath).toString("base64");

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      messages: [{
        role:    "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text",  text: ANALYSIS_PROMPT },
        ],
      }],
    });

    const raw     = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed  = JSON.parse(cleaned);

    const exRef = db.collection("clients").doc(CLIENT_ID).collection("design_examples").doc();
    await exRef.set({
      id:                    exRef.id,
      agency_id:             AGENCY_ID,
      client_id:             CLIENT_ID,
      visual_prompt:         parsed.visual_prompt         ?? "",
      layout_prompt:         parsed.layout_prompt         ?? "",
      visual_headline_style: parsed.visual_headline_style ?? "",
      pilar:                 parsed.pilar                 ?? "Produto",
      format:                parsed.format                ?? "feed",
      description:           parsed.description           ?? "",
      color_mood:            parsed.color_mood            ?? "",
      composition_zone:      parsed.composition_zone      ?? "bottom",
      source_url:            source,
      created_at:            FieldValue.serverTimestamp(),
    });

    console.log(`✅ ${parsed.pilar} | ${parsed.color_mood}`);
    imported++;

  } catch (err) {
    console.log(`❌ ${err.message}`);
    failed++;
  }
}

console.log(`\n🎉 Concluído! ✅ ${imported} importados | ❌ ${failed} falhas\n`);
