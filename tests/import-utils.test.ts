/**
 * Tests for the utility functions used by the bulk photo import endpoint.
 * These are extracted/tested in isolation — no Firestore connection needed.
 */
import { describe, it, expect } from "vitest";

// ─── Inline the pure utility functions from the route ──────────────────────────
// (copied here so tests don't depend on Next.js runtime or firebase-admin)

const CATEGORY_MAP: Record<string, string> = {
  alimento:   "produto",
  bebida:     "produto",
  produto:    "produto",
  objeto:     "outro",
  ambiente:   "ambiente",
  equipe:     "equipe",
  bastidores: "bastidores",
  bastidor:   "bastidores",
  cliente:    "cliente",
};

function mapCategory(raw?: string): string {
  if (!raw) return "outro";
  return CATEGORY_MAP[raw.toLowerCase().trim()] ?? "outro";
}

function flattenTags(tags?: Record<string, unknown>): string[] {
  if (!tags) return [];
  const result = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) result.add(v.trim().toLowerCase());
  };
  if (typeof tags.contexto === "string") tags.contexto.split(",").forEach(add);
  for (const field of ["elementos_principais", "cores_dominantes", "tags_adicionais"]) {
    if (Array.isArray(tags[field])) (tags[field] as unknown[]).forEach(add);
  }
  if (typeof tags.estilo_visual === "string")   add(tags.estilo_visual);
  if (typeof tags.qualidade_imagem === "string") add(`qualidade:${tags.qualidade_imagem}`);
  if (typeof tags.público_alvo    === "string") add(`público:${tags.público_alvo}`);
  return Array.from(result).filter(Boolean);
}

function resolveUrl(
  filename: string,
  publicBase: string,
  r2_path_prefix: string
): { url: string; r2_key: string; basename: string } {
  const hasPath = filename.includes("/");
  if (hasPath) {
    const basename = filename.split("/").pop() ?? filename;
    return { url: `${publicBase}/${filename}`, r2_key: filename, basename };
  }
  const prefix = r2_path_prefix.replace(/^\/|\/$/g, "");
  return {
    url:      prefix ? `${publicBase}/${prefix}/${filename}` : `${publicBase}/${filename}`,
    r2_key:   prefix ? `${prefix}/${filename}` : filename,
    basename: filename,
  };
}

// ─── mapCategory ──────────────────────────────────────────────────────────────
describe("mapCategory", () => {
  it("maps known categories correctly", () => {
    expect(mapCategory("alimento")).toBe("produto");
    expect(mapCategory("bebida")).toBe("produto");
    expect(mapCategory("produto")).toBe("produto");
    expect(mapCategory("ambiente")).toBe("ambiente");
    expect(mapCategory("equipe")).toBe("equipe");
    expect(mapCategory("bastidores")).toBe("bastidores");
    expect(mapCategory("bastidor")).toBe("bastidores");
    expect(mapCategory("cliente")).toBe("cliente");
    expect(mapCategory("objeto")).toBe("outro");
  });

  it("is case-insensitive", () => {
    expect(mapCategory("ALIMENTO")).toBe("produto");
    expect(mapCategory("Ambiente")).toBe("ambiente");
  });

  it("trims whitespace", () => {
    expect(mapCategory("  equipe  ")).toBe("equipe");
  });

  it("returns 'outro' for unknown categories", () => {
    expect(mapCategory("xyz")).toBe("outro");
    expect(mapCategory("")).toBe("outro");
    expect(mapCategory(undefined)).toBe("outro");
  });
});

// ─── flattenTags ──────────────────────────────────────────────────────────────
describe("flattenTags", () => {
  it("returns empty array for undefined input", () => {
    expect(flattenTags(undefined)).toEqual([]);
  });

  it("returns empty array for empty object", () => {
    expect(flattenTags({})).toEqual([]);
  });

  it("splits comma-separated contexto", () => {
    const tags = flattenTags({ contexto: "Mão, Loja, Interno" });
    expect(tags).toContain("mão");
    expect(tags).toContain("loja");
    expect(tags).toContain("interno");
  });

  it("flattens array fields", () => {
    const tags = flattenTags({
      elementos_principais: ["café", "xícara"],
      cores_dominantes:     ["marrom", "branco"],
    });
    expect(tags).toContain("café");
    expect(tags).toContain("xícara");
    expect(tags).toContain("marrom");
    expect(tags).toContain("branco");
  });

  it("prefixes qualidade_imagem", () => {
    const tags = flattenTags({ qualidade_imagem: "alta" });
    expect(tags).toContain("qualidade:alta");
  });

  it("prefixes público_alvo", () => {
    const tags = flattenTags({ público_alvo: "jovens" });
    expect(tags).toContain("público:jovens");
  });

  it("deduplicates tags", () => {
    const tags = flattenTags({
      elementos_principais: ["café"],
      tags_adicionais:      ["café"],
    });
    expect(tags.filter(t => t === "café").length).toBe(1);
  });

  it("lowercases all tags", () => {
    const tags = flattenTags({ elementos_principais: ["Café", "XÍCARA"] });
    expect(tags).toContain("café");
    expect(tags).toContain("xícara");
    expect(tags).not.toContain("Café");
  });
});

// ─── resolveUrl ───────────────────────────────────────────────────────────────
describe("resolveUrl", () => {
  const BASE   = "https://pub-abc.r2.dev";
  const PREFIX = "Imagens";

  it("format A (plain filename): prepends prefix", () => {
    const { url, r2_key, basename } = resolveUrl("photo.jpg", BASE, PREFIX);
    expect(url).toBe("https://pub-abc.r2.dev/Imagens/photo.jpg");
    expect(r2_key).toBe("Imagens/photo.jpg");
    expect(basename).toBe("photo.jpg");
  });

  it("format B (path filename): uses as-is", () => {
    const { url, r2_key, basename } = resolveUrl("Imagens/photo.jpg", BASE, PREFIX);
    expect(url).toBe("https://pub-abc.r2.dev/Imagens/photo.jpg");
    expect(r2_key).toBe("Imagens/photo.jpg");
    expect(basename).toBe("photo.jpg");
  });

  it("strips trailing slash from publicBase", () => {
    const { url } = resolveUrl("photo.jpg", `${BASE}/`, PREFIX);
    // publicBase is trimmed by the route before calling, but function itself doesn't trim
    // so we test it as-is — note the route does: publicBase = public_base_url.replace(/\/$/, "")
    expect(url).toBe("https://pub-abc.r2.dev//Imagens/photo.jpg");
    // (route caller is responsible for trimming — this test documents current behaviour)
  });

  it("handles empty prefix (no double slash)", () => {
    const { url, r2_key } = resolveUrl("photo.jpg", BASE, "");
    expect(url).toBe("https://pub-abc.r2.dev/photo.jpg");
    expect(r2_key).toBe("photo.jpg");
  });

  it("strips leading/trailing slashes from prefix", () => {
    const { url } = resolveUrl("photo.jpg", BASE, "/Imagens/");
    expect(url).toBe("https://pub-abc.r2.dev/Imagens/photo.jpg");
  });

  it("handles nested path in filename", () => {
    const { r2_key, basename } = resolveUrl("fotos/2026/photo.jpg", BASE, PREFIX);
    expect(r2_key).toBe("fotos/2026/photo.jpg");
    expect(basename).toBe("photo.jpg");
  });
});
