// lib/ai/compiler.ts
// Prompt Compiler V3 — pipeline determinístico de 9 etapas + ML.
// Monta o finalText perfeito para cada slide a partir de BrandKit, PlanoDePost e Recipe.

import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/firebase-admin";
import { paths } from "@/lib/firestore/paths";
import { FieldValue } from "firebase-admin/firestore";
import { resolveRefs, stripSlugs } from "./resolve-refs";
import { fetchFewShotOutcomes, resolvePromptModel } from "./outcome";
import { PROMPT_SLOT_ORDER } from "@/types";
import type {
  SlideBriefing, PlanoDePost, BrandKit, Recipe,
  PromptSlot, PromptSlotKey, CompiledPromptV3,
} from "@/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Slots livres que o LLM precisa escrever ───────────────────────────────────
const FREE_SLOTS: PromptSlotKey[] = ["ATMOSFERA", "COMPOSICAO", "ELEMENTOS_GRAFICOS"];

// ── Formato → model target heuristics ────────────────────────────────────────

function pickModelTarget(
  slots:   PromptSlot[],
  hints?:  string[],
): CompiledPromptV3["modelTarget"] {
  if (hints?.includes("ideogram")) return "ideogram-3";
  if (hints?.includes("nano-banana")) return "nano-banana";

  const textoLiteral = slots.find(s => s.key === "TEXTO_LITERAL")?.value ?? "";
  // Ideogram handles text in images better; use it when text is long or has punctuation
  if (textoLiteral.split("\n").length >= 2 || textoLiteral.length > 60) return "ideogram-3";
  return "flux-1.1-pro";
}

// ── Slot map helper ───────────────────────────────────────────────────────────

function makeSlot(
  key:      PromptSlotKey,
  value:    string,
  source:   PromptSlot["source"],
  required = false,
  confidence?: number,
): PromptSlot {
  return { key, required, value, source, confidence };
}

// ── Etapa 4: LLM escreve slots livres ────────────────────────────────────────

async function writeFreeSlots(
  slide:        SlideBriefing,
  plan:         PlanoDePost,
  brandKit:     BrandKit | null,
  recipe:       Recipe | null,
  fewShots:     { finalText: string }[],
  modelId:      string,
): Promise<Partial<Record<PromptSlotKey, string>>> {
  const fewShotSection = fewShots.length > 0
    ? `\nEXEMPLOS DE PROMPTS APROVADOS ANTERIORMENTE (use como referência de estilo):\n${fewShots.slice(0, 3).map((f, i) => `${i + 1}. ${f.finalText}`).join("\n")}\n`
    : "";

  const brandContext = brandKit
    ? `Brand Kit: Tom=${brandKit.tone} | Paleta primária=${brandKit.palette.primary} | Tipografia headline=${brandKit.typography.headline}`
    : "Brand Kit: não configurado";

  const systemPrompt = `Você é um especialista em prompts para geração de imagens com IA, focado em conteúdo para Instagram brasileiro. Você escreve descrições visuais precisas e evocativas que traduzem a intenção criativa em imagens de alto impacto.

REGRAS:
- Escreva em inglês (os modelos de imagem entendem melhor)
- Seja específico e visual — descreva o que aparece na imagem, não o que ela deve "comunicar"
- Cada slot deve ser uma frase descritiva curta (10-25 palavras)
- ELEMENTOS_GRAFICOS: descreva formas, linhas, ícones, badges — omita se não houver
- ATMOSFERA: adjetivos e qualidades da cena (ex: "dramatic moody lighting, deep shadows, intimate warmth")
- COMPOSICAO: layout, posicionamento, framing (ex: "centered subject, rule-of-thirds, negative space left side")`;

  const userPrompt = `${brandContext}
Plano: ${plan.bigIdea}
Estilo visual do plano: ${plan.estiloVisual}
Slide ${slide.n} — Intenção: ${slide.intencao}
Visual descrito: ${slide.visual}
${fewShotSection}
Retorne APENAS JSON válido com os 3 slots:

{
  "ATMOSFERA": "...",
  "COMPOSICAO": "...",
  "ELEMENTOS_GRAFICOS": "..."
}`;

  try {
    const msg = await anthropic.messages.create({
      model:      modelId,
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const raw     = msg.content.filter(b => b.type === "text").map(b => (b as { text: string }).text).join("");
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as Partial<Record<PromptSlotKey, string>>;
  } catch {
    // Fallback: derive from plan data
    return {
      ATMOSFERA:          `${plan.tomVoz.join(", ")} mood, ${plan.estiloVisual.split(",")[0]}`,
      COMPOSICAO:         "centered composition, clean layout, strong visual hierarchy",
      ELEMENTOS_GRAFICOS: "",
    };
  }
}

// ── Main compiler ─────────────────────────────────────────────────────────────

export async function compilePrompt(input: {
  uid:          string;
  clientId:     string;
  postId:       string;
  slideId:      string;
  slide:        SlideBriefing;
  plan:         PlanoDePost;
  brandKit:     BrandKit | null;
  recipe?:      Recipe | null;
  format?:      string;
  compilerHints?: string[];
}): Promise<CompiledPromptV3> {
  const { uid, clientId, postId, slideId, slide, plan, brandKit, recipe, format = "feed", compilerHints } = input;

  const slotMap: Map<PromptSlotKey, PromptSlot> = new Map();

  // ── ETAPA 1: Preenche slots base da Recipe ───────────────────────────────────
  if (recipe) {
    for (const [key, value] of Object.entries(recipe.slotDefaults)) {
      if (value) slotMap.set(key as PromptSlotKey, makeSlot(key as PromptSlotKey, value, "recipe"));
    }
  }

  // ── ETAPA 2: Aplica overrides do BrandKit ────────────────────────────────────
  if (brandKit) {
    const palette = [brandKit.palette.primary, brandKit.palette.secondary, ...(brandKit.palette.accents ?? [])]
      .filter(Boolean).slice(0, 3).join(", ");

    if (!slotMap.has("ESTETICA_MAE") && brandKit.tone) {
      slotMap.set("ESTETICA_MAE", makeSlot("ESTETICA_MAE", brandKit.tone, "brandkit", true));
    }
    if (!slotMap.has("PALETA")) {
      slotMap.set("PALETA", makeSlot("PALETA", `color palette: ${palette}`, "brandkit"));
    }
    if (!slotMap.has("HIERARQUIA_TIPO") && brandKit.typography.headline) {
      slotMap.set("HIERARQUIA_TIPO", makeSlot(
        "HIERARQUIA_TIPO",
        `${brandKit.typography.headline} headline font, ${brandKit.typography.body} body font`,
        "brandkit",
      ));
    }
    if (!slotMap.has("ACABAMENTO")) {
      const acabamento = recipe?.slotDefaults.ACABAMENTO ?? `${brandKit.tone}, premium brand quality`;
      slotMap.set("ACABAMENTO", makeSlot("ACABAMENTO", acabamento, "brandkit"));
    }
  }

  // ── ETAPA 3: Aplica overrides do Plan ────────────────────────────────────────
  if (!slotMap.has("ESTETICA_MAE") && plan.estiloVisual) {
    slotMap.set("ESTETICA_MAE", makeSlot("ESTETICA_MAE", plan.estiloVisual, "plan", true));
  }
  const planPalette = plan.paletaAplicada?.join(", ");
  if (!slotMap.has("PALETA") && planPalette) {
    slotMap.set("PALETA", makeSlot("PALETA", `colors: ${planPalette}`, "plan"));
  }

  // FORMATO from format param
  const formatMap: Record<string, string> = {
    feed:          "4:5 vertical Instagram feed, portrait orientation",
    carousel:      "4:5 vertical Instagram carousel slide, portrait orientation",
    story:         "9:16 vertical Instagram Story, full-screen portrait",
    "reels-cover": "9:16 vertical Instagram Reels cover, full-screen portrait",
  };
  slotMap.set("FORMATO", makeSlot("FORMATO", formatMap[format] ?? formatMap.feed, "plan", true));

  // ── ETAPA 4: Resolve @slugs em slide.visual ──────────────────────────────────
  const { resolved: refsResolved, missing } = await resolveRefs(uid, clientId, slide.visual);

  if (refsResolved.length > 0) {
    // REF_ESTILO = primeiro ref encontrado
    slotMap.set("REF_ESTILO", makeSlot("REF_ESTILO", `reference image provided as style guide`, "plan"));
    // IMAGEM_PRINCIPAL = segundo ref (se houver)
    if (refsResolved.length >= 2) {
      slotMap.set("IMAGEM_PRINCIPAL", makeSlot("IMAGEM_PRINCIPAL", `main subject from provided reference`, "plan"));
    }
  }

  if (missing.length > 0) {
    console.warn(`[compiler] @slugs não encontrados: ${missing.join(", ")}`);
  }

  // IMAGEM_PRINCIPAL from plan references (first @slug in referenciasDecididas)
  if (!slotMap.has("IMAGEM_PRINCIPAL") && plan.referenciasDecididas?.length > 0) {
    slotMap.set("IMAGEM_PRINCIPAL", makeSlot(
      "IMAGEM_PRINCIPAL",
      stripSlugs(plan.referenciasDecididas[0]),
      "plan",
    ));
  }

  // ── ETAPA 5: TEXTO_LITERAL — copy do slide formatada ────────────────────────
  const copyLines = slide.copy
    .split(/[.\n]/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => `"${l}"`)
    .join("\n");
  slotMap.set("TEXTO_LITERAL", makeSlot("TEXTO_LITERAL", copyLines, "plan", true));

  // ── ETAPA 6: Few-shot + LLM para slots livres ────────────────────────────────
  const missingFreeSlots = FREE_SLOTS.filter(k => !slotMap.has(k));

  if (missingFreeSlots.length > 0) {
    const [fewShots, modelId] = await Promise.all([
      fetchFewShotOutcomes(uid, clientId, 5),
      resolvePromptModel(uid, clientId),
    ]);

    const llmSlots = await writeFreeSlots(slide, plan, brandKit, recipe ?? null, fewShots, modelId);

    for (const key of missingFreeSlots) {
      const value = llmSlots[key];
      if (value) {
        slotMap.set(key, makeSlot(key, value, "ml", false, 0.8));
      }
    }
  }

  // ── ETAPA 7: Aplica slotWeights (Modelo A) ───────────────────────────────────
  // Reforça slots com peso positivo (boosted via confidence)
  const memSnap = await adminDb.doc(paths.memory(uid, clientId)).get();
  const slotWeights = memSnap.data()?.slotWeights as Record<PromptSlotKey, { approvals: number; rejections: number; total: number }> | undefined;

  if (slotWeights) {
    for (const [key, entry] of Object.entries(slotWeights)) {
      const slot = slotMap.get(key as PromptSlotKey);
      if (slot && entry.total >= 5) {
        const weight = (entry.approvals - entry.rejections) / entry.total;
        slotMap.set(key as PromptSlotKey, { ...slot, confidence: Math.max(0, Math.min(1, 0.5 + weight * 0.5)) });
      }
    }
  }

  // ── ETAPA 8: Concatena na ordem dos 11 slots → finalText ─────────────────────
  const orderedSlots: PromptSlot[] = PROMPT_SLOT_ORDER
    .map(key => slotMap.get(key))
    .filter((s): s is PromptSlot => !!s && s.value.length > 0);

  const finalText = orderedSlots
    .map(s => s.value)
    .join(", ")
    .replace(/,\s*,/g, ",")
    .trim();

  // ── ETAPA 9: Escolhe modelTarget ─────────────────────────────────────────────
  const modelTarget = pickModelTarget(orderedSlots, compilerHints);

  // Verifica slots required
  const missingRequired = PROMPT_SLOT_ORDER
    .map(k => slotMap.get(k))
    .filter((s): s is PromptSlot => !!s && s.required && !s.value);

  if (missingRequired.length > 0) {
    throw new Error(`Compiler: slots obrigatórios faltando: ${missingRequired.map(s => s.key).join(", ")}`);
  }

  const result: CompiledPromptV3 = {
    postId,
    slideId,
    slots:        orderedSlots,
    finalText,
    modelTarget,
    refsResolved,
    version:      1,
    compiledAt:   null as unknown as CompiledPromptV3["compiledAt"],
  };

  // ── Persiste em Firestore ─────────────────────────────────────────────────────
  const existing = await adminDb.doc(paths.compiledPrompt(uid, clientId, postId, slideId)).get();
  const version  = existing.exists ? ((existing.data()?.version ?? 0) as number) + 1 : 1;

  await adminDb.doc(paths.compiledPrompt(uid, clientId, postId, slideId)).set({
    ...result,
    version,
    compiledAt: FieldValue.serverTimestamp(),
  });

  return { ...result, version };
}
