import { describe, it, expect } from "vitest";
import { buildStrategyPrompt } from "../lib/prompts/strategy";
import { buildCopyPrompt, selectFramework, HOOK_GUIDE, FORMAT_GUIDE } from "../lib/prompts/copy";
import type { BrandProfile } from "../types";

const mockClient: BrandProfile = {
  id:               "test-client",
  agency_id:        "test-agency",
  name:             "Café Aroma",
  logo_url:         null,
  primary_color:    "#8B4513",
  secondary_color:  "#F5DEB3",
  fonts:            ["Montserrat"],
  tone_of_voice:    "caloroso e acolhedor",
  segment:          "cafeteria artesanal",
  target_audience:  "amantes de café 25-40 anos",
  keywords:         ["café especial", "artesanal", "aconchego"],
  avoid_words:      ["barato", "promoção"],
  instagram_handle: "@cafearoma",
  bio:              "Café de origem única, torrado na hora.",
  created_at:       null as never,
};

// ─── buildStrategyPrompt ──────────────────────────────────────────────────────
describe("buildStrategyPrompt", () => {
  it("includes brand name", () => {
    const prompt = buildStrategyPrompt(mockClient);
    expect(prompt).toContain("CAFÉ AROMA");
  });

  it("includes segment and target audience", () => {
    const prompt = buildStrategyPrompt(mockClient);
    expect(prompt).toContain("cafeteria artesanal");
    expect(prompt).toContain("amantes de café 25-40 anos");
  });

  it("includes campaign focus when provided", () => {
    const prompt = buildStrategyPrompt(mockClient, "lançamento blend especial");
    expect(prompt).toContain("lançamento blend especial");
  });

  it("omits campaign focus section when not provided", () => {
    const prompt = buildStrategyPrompt(mockClient);
    expect(prompt).not.toContain("Foco de campanha indicado");
  });

  it("returns valid JSON schema description in output spec", () => {
    const prompt = buildStrategyPrompt(mockClient);
    expect(prompt).toContain('"pilar"');
    expect(prompt).toContain('"formato_sugerido"');
    expect(prompt).toContain('"hook_type"');
  });
});

// ─── selectFramework ─────────────────────────────────────────────────────────
describe("selectFramework", () => {
  it("maps hook override to correct framework", () => {
    expect(selectFramework("qualquer objetivo", "Dor").framework).toBe("PASTOR");
    expect(selectFramework("qualquer objetivo", "Prova Social").framework).toBe("PPPP");
    expect(selectFramework("qualquer objetivo", "Pergunta").framework).toBe("PAS");
  });

  it("infers PASTOR for sales objectives", () => {
    const { framework } = selectFramework("aumentar vendas do produto");
    expect(framework).toBe("PASTOR");
  });

  it("infers AIDA for educational objectives", () => {
    const { framework } = selectFramework("educar o público sobre café especial");
    expect(framework).toBe("AIDA");
  });

  it("infers PAS for engagement objectives", () => {
    const { framework } = selectFramework("aumentar engajamento nos comentários");
    expect(framework).toBe("PAS");
  });

  it("defaults to PAS when no pattern matches", () => {
    const { framework } = selectFramework("objetivo genérico sem palavras-chave");
    expect(framework).toBe("PAS");
  });

  it("returns valid hook guide key for every built-in hook", () => {
    for (const hook of ["Dor", "Curiosidade", "Pergunta", "Prova Social", "Controvérsia", "Número"]) {
      const { hook: h } = selectFramework("qualquer", hook);
      expect(HOOK_GUIDE[h]).toBeDefined();
    }
  });
});

// ─── buildCopyPrompt ──────────────────────────────────────────────────────────
describe("buildCopyPrompt", () => {
  it("includes brand primary and secondary colors", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "aumentar vendas");
    expect(prompt).toContain("#8B4513");
    expect(prompt).toContain("#F5DEB3");
  });

  it("includes avoid_words directive", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo");
    expect(prompt).toContain("barato");
    expect(prompt).toContain("promoção");
  });

  it("includes format guide for feed", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo");
    expect(prompt).toContain("FEED");
    expect(prompt).toContain("2200 chars");
  });

  it("includes format guide for stories", () => {
    const prompt = buildCopyPrompt(mockClient, "stories", "objetivo");
    expect(prompt).toContain("STORIES");
  });

  it("includes strategy briefing when provided", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo", {
      pilar: "Produto",
      dor_desejo: "falta de café de qualidade",
    });
    expect(prompt).toContain("Produto");
    expect(prompt).toContain("falta de café de qualidade");
  });

  it("omits strategy section when not provided", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo");
    expect(prompt).not.toContain("BRIEFING DO ESTRATEGISTA");
  });

  it("instructs visual_prompt to be in English", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo");
    expect(prompt).toContain("visual_prompt em inglês");
  });

  it("includes format-specific fields in JSON spec", () => {
    const prompt = buildCopyPrompt(mockClient, "feed", "objetivo");
    expect(prompt).toContain('"visual_headline"');
    expect(prompt).toContain('"hashtags"');
    expect(prompt).toContain('"layout_prompt"');
  });
});

// ─── FORMAT_GUIDE ─────────────────────────────────────────────────────────────
describe("FORMAT_GUIDE", () => {
  it("has entries for all supported formats", () => {
    expect(FORMAT_GUIDE["feed"]).toBeDefined();
    expect(FORMAT_GUIDE["stories"]).toBeDefined();
    expect(FORMAT_GUIDE["reels_cover"]).toBeDefined();
  });
});
