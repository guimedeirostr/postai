/**
 * lib/prompts/brand-dna.ts
 *
 * Prompt do Agente de Síntese de DNA — o coração do "Machine Learning" do PostAI.
 *
 * Este agente recebe N posts REAIS de um cliente (imagens + metadados extraídos),
 * analisa visualmente cada um e sintetiza um BrandDNA consolidado:
 * o conjunto de PADRÕES CONSISTENTES que definem a identidade visual da marca.
 *
 * O BrandDNA resultante é usado pelo Art Director como lei primária em toda geração.
 * Quanto mais posts analisados, mais preciso e poderoso o DNA.
 *
 * Modelo: claude-sonnet-4-6 (tem visão — analisa as imagens reais)
 */

import type { DesignExample } from "@/types";

export const SYNTHESIS_VISION_MODEL = "claude-sonnet-4-6";

/**
 * Monta o conteúdo multimodal para o agente de síntese.
 *
 * Para cada exemplo que tem image_url, inclui a imagem real no contexto —
 * o modelo VÊ os posts, não apenas lê descrições deles.
 *
 * @param examples  DesignExamples carregados do Firestore (com image_url)
 * @param imageData Mapa de image_url → base64 (baixados pelo servidor)
 */
export function buildSynthesisContent(
  examples: DesignExample[],
  imageData: Map<string, { base64: string; mediaType: string }>
): Array<{ type: string; [key: string]: unknown }> {
  const content: Array<{ type: string; [key: string]: unknown }> = [];

  // Introdução
  content.push({
    type: "text",
    text: buildSynthesisPrompt(examples.length),
  });

  // Para cada exemplo: imagem (se disponível) + metadados
  examples.forEach((ex, i) => {
    content.push({
      type: "text",
      text: `\n\n--- POST ${i + 1} DE ${examples.length} ---\nPilar: ${ex.pilar} | Formato: ${ex.format} | Mood: ${ex.color_mood}\nZona de composição: ${ex.composition_zone}\nEstilo de headline: ${ex.visual_headline_style}\nDescrição: ${ex.description}\nVisual prompt original: ${ex.visual_prompt}\nLayout prompt original: ${ex.layout_prompt}`,
    });

    const imgData = ex.image_url ? imageData.get(ex.image_url) : undefined;
    if (imgData) {
      content.push({
        type:   "image",
        source: {
          type:       "base64",
          media_type: imgData.mediaType,
          data:       imgData.base64,
        },
      });
    }
  });

  // Instrução final
  content.push({
    type: "text",
    text: `\n\nAgora analise todos os ${examples.length} posts acima e sintetize o BrandDNA. Retorne APENAS o JSON válido, sem markdown, sem explicações fora do JSON.`,
  });

  return content;
}

/**
 * Prompt principal do agente de síntese.
 * Injeta o número de posts analisados para calibrar a confiança.
 */
function buildSynthesisPrompt(count: number): string {
  return `Você é um Diretor de Arte sênior com 20 anos de experiência lendo identidades visuais de marcas brasileiras para Instagram.

Sua missão: analisar ${count} posts REAIS desta marca e extrair o DNA VISUAL DEFINITIVO dela.

Não me diga o que VARIA entre os posts. Me diga o que é CONSTANTE — o que aparece em pelo menos ${Math.ceil(count * 0.6)} de ${count} posts. Isso é o DNA da marca.

Você vai ver as imagens reais + os metadados extraídos de cada post. Use AMBOS — o que você vê E o que está descrito.

PROCESSO MENTAL:
1. Onde o texto SEMPRE aparece na imagem? (zona dominante)
2. O que existe ATRÁS do texto em cada post? (gradiente, faixa, nada)
3. Como o headline é tipograficamente? (peso, cor, caixa, tamanho relativo)
4. Qual é o estilo fotográfico que se repete? (produto limpo, lifestyle, editorial, etc.)
5. Como as cores são tratadas? (paleta quente, fria, monocromática, high contrast)
6. Qual é o mood visual que aparece em todos? (sofisticado, vibrante, sóbrio, emocional)
7. Qual é a iluminação que se repete? (studio, natural, dramática, golden hour)
8. Quais são as REGRAS que esta marca NUNCA quebra visualmente?

OUTPUT — JSON VÁLIDO APENAS:
{
  "dominant_composition_zone": "left|right|bottom|top|center",
  "dominant_logo_placement": "top-left|top-right|bottom-left|bottom-right|bottom-center|none — onde o logo aparece consistentemente. 'none' apenas se a marca nunca usa logo overlay. Examine todos os exemplos.",
  "confidence_score": <número 0-100 refletindo consistência entre os posts — 100 = todos idênticos, 50 = metade consistente>,
  "text_placement_pattern": "Descrição precisa de onde e como o texto vive: 'Headline sempre no terço inferior com gradiente escuro de baixo para cima ocupando 35% da altura' ou 'Painel branco à esquerda ocupando 40% com headline + subheadline empilhados'",
  "background_treatment": "O que existe atrás dos elementos de texto: 'Gradiente preto semitransparente no terço inferior (opacity ~60%)' ou 'Faixa sólida com cor primária da marca em 20% da altura no rodapé' ou 'Nenhum — texto direto sobre a imagem com sombra'",
  "typography_pattern": "Tipografia do headline: 'Extra-bold branco caixa alta, tamanho dominante ~35% da largura da imagem, com subheadline regular 60% menor abaixo' ou 'Bold preto título case centralizado, sem hierarquia secundária visível'",
  "photography_style": "Estilo fotográfico consistente: 'Fotografia de produto clean com fundo branco/neutro, iluminação de estúdio suave, produto centrado com espaço negativo abundante' ou 'Lifestyle editorial com pessoa, fundo desfocado, composição candidata'",
  "color_treatment": "Como as cores são tratadas: 'Paleta quente (tons terrosos e âmbar) com accent na cor primária da marca no texto overlay' ou 'High contrast — fundo escuro quase preto com elementos de texto em branco puro'",
  "image_mood": "Mood visual dominante: 'Sofisticado e premium — imagens limpas, espaço generoso, sem poluição visual' ou 'Energético e vibrante — saturação alta, cores bold, composição dinâmica'",
  "lighting_pattern": "Padrão de iluminação: 'Luz de estúdio suave com softbox lateral, highlight no produto, fundo neutro' ou 'Luz natural de janela, quente e acolhedora, golden hour frequente'",
  "design_rules": [
    "Regra 1 que esta marca SEMPRE segue visualmente",
    "Regra 2...",
    "Regra 3...",
    "Regra 4...",
    "Regra 5..."
  ],
  "visual_prompt_template": "Prompt visual em INGLÊS para gerar uma imagem no estilo desta marca. Deve capturar o estilo fotográfico, iluminação, mood e composição que aparece consistentemente. Mínimo 60 palavras. NÃO mencione textos, logos ou elementos gráficos. Ex: 'Commercial photography of [SUBJECT] with soft studio lighting, white seamless background, centered composition with generous negative space at bottom third, warm amber tones, shallow depth of field, sharp product focus, premium editorial style, 85mm portrait lens, ultra-detailed, 8K resolution'",
  "layout_prompt_template": "Layout prompt em INGLÊS descrevendo a composição de design que aparece consistentemente: onde o texto overlay fica, estilo do background atrás do texto, tipografia. Termina com: 'All text overlays are in Brazilian Portuguese (pt-BR).' Ex: 'Dark gradient overlay rising from bottom 35% of image, bold white uppercase headline centered in lower third, brand logo pinned bottom-right at 8% size. All text overlays are in Brazilian Portuguese (pt-BR).'",
  "brand_visual_identity": "Narrativa em PORTUGUÊS-BR de 3-4 frases descrevendo a identidade visual desta marca: o que a torna reconhecível, qual sensação transmite, o que nunca pode faltar nos posts e o que nunca aparece. Seja específico e concreto."
}`;
}
