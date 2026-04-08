/**
 * lib/prompts/ideogram-text.ts
 *
 * Constrói prompts para o Ideogram v3 com tipografia nativa embutida.
 *
 * O Ideogram é único entre os modelos de imagem por renderizar texto
 * com qualidade tipográfica dentro da arte — sem precisar do compositor.
 * Ideal para posts onde o texto É parte do design visual (não sobreposto).
 *
 * Uso:
 *   - Quando `provider=ideogram_text` na geração
 *   - A arte final já contém headline + logo-text — não precisa de compositor
 *
 * Limitações:
 *   - Não suporta logo como imagem (apenas texto da marca)
 *   - O texto deve ter no máximo ~40 chars para manter qualidade
 *   - Langue-ptBR pode ter erros de ortografia ocasionais (re-verificar)
 */

import type { BrandProfile } from "@/types";
import type { StrategyBriefing } from "@/types";

interface IdeogramTextInput {
  client:    BrandProfile;
  headline:  string;          // visual_headline (máx 6 palavras, pt-BR)
  strategy?: Partial<StrategyBriefing>;
  basePrompt: string;         // visual_prompt do post (inglês, cena fotográfica)
}

/**
 * Monta o prompt para Ideogram com o texto embutido na arte.
 *
 * O Ideogram responde melhor quando:
 * 1. O texto está entre aspas na descrição
 * 2. O estilo é especificado (bold, sans-serif, etc.)
 * 3. O fundo/contexto está bem descrito
 */
export function buildIdeogramTextPrompt(input: IdeogramTextInput): {
  prompt:          string;
  negative_prompt: string;
  style_type:      "REALISTIC" | "DESIGN" | "RENDER_3D" | "ANIME";
} {
  const { client, headline, basePrompt } = input;

  // Escolhe o estilo visual base a partir do segmento da marca
  const seg = (client.segment ?? "").toLowerCase();
  const isRetail    = /mercado|supermercado|varejo|empório|loja|açougue|hortifruti/.test(seg);
  const isGourmet   = /restaurante|gourmet|gastro|culinária|café|bistrô|padaria/.test(seg);
  const isFitness   = /fit|academia|saúde|esport|nutrição/.test(seg);
  const isLuxe      = /luxo|premium|alta renda|imob|moda|joia|relógio/.test(seg);

  const style_type: "REALISTIC" | "DESIGN" | "RENDER_3D" | "ANIME" =
    (isRetail || isGourmet) ? "REALISTIC" : "DESIGN";

  // Escolhe a abordagem tipográfica conforme o segmento
  const typographyStyle = isGourmet
    ? "elegant italic serif typography, gold or cream colored text, fine dining aesthetic"
    : isRetail
    ? "bold condensed sans-serif typography, high contrast, red and white colors, impact font"
    : isFitness
    ? "bold athletic typography, uppercase, strong contrast, dynamic energy"
    : isLuxe
    ? "refined serif typography, minimalist, luxury brand aesthetic"
    : "modern bold sans-serif typography, clean layout";

  // Posicionamento do texto — geralmente no terço inferior para não cobrir o produto
  const textPlacement = "in the lower third of the image";

  const prompt = [
    basePrompt,
    `Professional Instagram post design.`,
    `Text overlay ${textPlacement}: "${headline}" — ${typographyStyle}.`,
    `Brand name "${client.name}" displayed as small elegant logo text.`,
    `@${client.instagram_handle ?? client.name} handle visible subtly.`,
    `High-end Brazilian marketing agency quality.`,
    `Sharp, legible text with perfect contrast against background.`,
    `No spelling errors. Text reads exactly: "${headline}".`,
  ].join(" ");

  const negative_prompt = [
    "blurry text",
    "misspelled words",
    "unreadable typography",
    "distorted letters",
    "overlapping text",
    "lorem ipsum",
    "watermark",
    "ugly design",
    "low quality",
  ].join(", ");

  return { prompt, negative_prompt, style_type };
}
