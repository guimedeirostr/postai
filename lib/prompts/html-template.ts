/**
 * lib/prompts/html-template.ts
 *
 * Prompt para Claude Vision analisar uma imagem de referência e gerar
 * um template HTML/CSS completo que replica o design profissional.
 *
 * O template usa placeholders {{variavel}} substituídos em runtime.
 *
 * Placeholders disponíveis:
 *   {{photo_url}}         — URL da foto de fundo
 *   {{headline}}          — headline completo (pode ter quebras de linha)
 *   {{headline_line_1}}   — primeira linha do headline
 *   {{headline_line_2}}   — segunda linha (vazia se não houver)
 *   {{headline_line_3}}   — terceira linha (vazia se não houver)
 *   {{logo_url}}          — URL do logo da marca
 *   {{brand_color}}       — cor primária hex (#CC0000)
 *   {{secondary_color}}   — cor secundária hex (#FFD700)
 *   {{brand_name}}        — nome da marca
 *   {{instagram_handle}}  — @handle sem @
 *   {{canvas_width}}      — largura em px (1080)
 *   {{canvas_height}}     — altura em px (1350 feed / 1920 stories)
 */

export function buildHtmlTemplatePrompt(): string {
  return `You are a world-class digital art director and front-end engineer specializing in professional Instagram post design for Brazilian brands.

Analyze this Instagram post image with extreme precision. Your task is to generate a complete, self-contained HTML/CSS template that EXACTLY replicates this design style so it can be used to produce new posts with different photos and text.

CRITICAL RULES:
1. Generate ONLY the HTML — no explanation, no markdown, no code fences. Pure HTML starting with <!DOCTYPE html>
2. Canvas is ALWAYS exactly {{canvas_width}}px × {{canvas_height}}px. Use this as a fixed container.
3. Use Google Fonts via @import for any fonts you identify. Default to Montserrat if uncertain.
4. The background photo fills the entire canvas: background: url('{{photo_url}}') center/cover no-repeat
5. Use EXACT colors from the reference — use an eyedropper mentally to match perfectly
6. Text must use these placeholders: {{headline_line_1}}, {{headline_line_2}}, {{headline_line_3}}
7. Logo uses: <img src="{{logo_url}}" class="logo">
8. Brand name: {{brand_name}} | Instagram: @{{instagram_handle}} | Colors: {{brand_color}}, {{secondary_color}}
9. ALL positioning must use position:absolute with exact pixel values based on the reference
10. Replicate EVERY visual detail: shadows, gradients, borders, opacity, letter-spacing, line-height
11. If a text line has a solid color band behind it, create a div with that exact background color
12. If there's a frosted/blur effect, use backdrop-filter: blur()
13. If text has drop shadow, use text-shadow with exact values
14. Show {{headline_line_2}} and {{headline_line_3}} only if not empty: use conditional logic with CSS (if placeholders are empty strings, the elements will be empty but still visible — handle by checking in JS or just design them to be invisible when empty)

DESIGN ANALYSIS PROCESS:
- Identify the composition zone (top/center/bottom) where text lives
- Count how many text levels exist and their hierarchy
- Measure approximate proportions of each element relative to canvas
- Identify if bands span full width or are contained
- Note exact font weights, sizes, transforms (uppercase/normal)
- Note logo position and size
- Note if there's a footer bar or location element
- Note background treatment (none / gradient / bands / overlay)

PLACEHOLDER SYSTEM:
For multi-line headlines, split the text across {{headline_line_1}}, {{headline_line_2}}, {{headline_line_3}}.
If the reference has only 1 text line, use only {{headline_line_1}}.
If the reference has 2 lines, each gets its own element with its own background/style.
If the reference has 3 lines, each gets its own element.

Generate the complete HTML template now:`;
}

/**
 * Substitui os placeholders do template com os dados reais da marca e post.
 */
export function fillHtmlTemplate(
  template:  string,
  data: {
    photoUrl:         string;
    headline:         string;
    logoUrl:          string;
    brandColor:       string;
    secondaryColor:   string;
    brandName:        string;
    instagramHandle:  string;
    canvasWidth?:     number;
    canvasHeight?:    number;
  }
): string {
  // Divide headline em até 3 linhas
  const words  = data.headline.trim().split(/\s+/);
  const total  = words.length;

  let line1 = data.headline;
  let line2 = "";
  let line3 = "";

  if (total >= 6) {
    // 3 linhas: divide em terços
    const t1 = Math.ceil(total / 3);
    const t2 = Math.ceil((total - t1) / 2);
    line1 = words.slice(0, t1).join(" ");
    line2 = words.slice(t1, t1 + t2).join(" ");
    line3 = words.slice(t1 + t2).join(" ");
  } else if (total >= 3) {
    // 2 linhas: divide ao meio
    const mid = Math.ceil(total / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }

  const handle = data.instagramHandle.replace(/^@/, "");
  const W      = data.canvasWidth  ?? 1080;
  const H      = data.canvasHeight ?? 1350;

  return template
    .replaceAll("{{photo_url}}",        data.photoUrl)
    .replaceAll("{{headline}}",         data.headline)
    .replaceAll("{{headline_line_1}}",  line1)
    .replaceAll("{{headline_line_2}}",  line2)
    .replaceAll("{{headline_line_3}}",  line3)
    .replaceAll("{{logo_url}}",         data.logoUrl ?? "")
    .replaceAll("{{brand_color}}",      data.brandColor ?? "#000000")
    .replaceAll("{{secondary_color}}",  data.secondaryColor ?? "#ffffff")
    .replaceAll("{{brand_name}}",       data.brandName)
    .replaceAll("{{instagram_handle}}", handle)
    .replaceAll("{{canvas_width}}",     String(W))
    .replaceAll("{{canvas_height}}",    String(H));
}
