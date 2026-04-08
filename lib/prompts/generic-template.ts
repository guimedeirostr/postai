/**
 * lib/prompts/generic-template.ts
 *
 * Gera um template HTML/CSS genérico de alta qualidade para o Chromium renderer
 * quando nenhum html_template de referência está disponível.
 *
 * Usa os dados da marca e do layer_stack para criar uma composição elegante:
 * - Fontes reais do Google (Montserrat para impacto, Cormorant para elegância)
 * - Gradiente de wash configurável
 * - Logo posicionado conforme DNA
 * - Footer com @handle
 * - Text-shadow para legibilidade sem precisar de overlay pesado
 */

import type { LayerStack } from "@/types";

interface GenericTemplateData {
  photoUrl:        string;
  headline:        string;        // visual_headline completo (pré-split)
  preHeadline:     string;
  captionFirstLine: string;
  logoUrl:         string;
  brandColor:      string;
  secondaryColor:  string;
  brandName:       string;
  instagramHandle: string;
  format:          "feed" | "stories" | "reels_cover";
  layer_stack?:    LayerStack;
}

/**
 * Gera HTML/CSS genérico profissional para o Chromium renderer.
 * Usado como fallback quando não há html_template de referência.
 */
export function buildGenericTemplate(data: GenericTemplateData): string {
  const W = 1080;
  const H = data.format === "feed" ? 1350 : 1920;

  const ls = data.layer_stack;

  // ── Determinar configuração do wash ──────────────────────────────────────
  const washType    = ls?.wash?.type ?? "gradient";
  const hasWash     = washType !== "none";
  const washColor   = ls?.wash?.color ?? "rgba(0,0,0,0.75)";
  const washHeight  = Math.round(H * 0.45); // ~45% da altura

  // ── Posicionamento do logo ────────────────────────────────────────────────
  const logoPos = ls?.brand_elements?.logo_position ?? "top-center";
  const logoSize = ls?.brand_elements?.logo_size ?? "medium";
  const logoW   = logoSize === "large" ? 280 : logoSize === "small" ? 140 : 200;

  const logoCSS = (() => {
    switch (logoPos) {
      case "top-left":     return `top:50px; left:50px;`;
      case "top-right":    return `top:50px; right:50px;`;
      case "top-center":   return `top:50px; left:50%; transform:translateX(-50%);`;
      case "bottom-left":  return `bottom:80px; left:50px;`;
      case "bottom-right": return `bottom:80px; right:50px;`;
      case "bottom-center":return `bottom:80px; left:50%; transform:translateX(-50%);`;
      default:             return `top:50px; left:50%; transform:translateX(-50%);`;
    }
  })();

  // ── Zona de texto: posição vertical ──────────────────────────────────────
  const compZone = ls ? "bottom" : "bottom"; // default bottom
  const textBottom = (() => {
    if (logoPos.startsWith("bottom")) return 260; // logo embaixo → texto sobe
    return 140;
  })();

  // ── Cor do texto ─────────────────────────────────────────────────────────
  // Se o wash for claro, usa texto escuro; senão, branco
  const textColor = "#ffffff";

  // ── Handle ───────────────────────────────────────────────────────────────
  const handle = data.instagramHandle.replace(/^@/, "");

  // ── Split do headline ─────────────────────────────────────────────────────
  const words = data.headline.trim().split(/\s+/);
  const total = words.length;
  let line1 = data.headline, line2 = "", line3 = "";
  if (total >= 8) {
    const t1 = Math.ceil(total * 0.4), t2 = Math.ceil((total - t1) / 2);
    line1 = words.slice(0, t1).join(" ");
    line2 = words.slice(t1, t1 + t2).join(" ");
    line3 = words.slice(t1 + t2).join(" ");
  } else if (total >= 5) {
    const mid = Math.floor(total / 2);
    line1 = words.slice(0, mid).join(" ");
    line2 = words.slice(mid).join(" ");
  }

  // Tamanho do headline baseado no comprimento
  const maxLen = Math.max(line1.length, line2.length, line3.length);
  const headlineSize = maxLen > 20 ? 72 : maxLen > 15 ? 88 : 108;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,600;1,400;1,600&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{width:${W}px;height:${H}px;overflow:hidden;}
.canvas{
  position:relative;width:${W}px;height:${H}px;overflow:hidden;
  background:url('${data.photoUrl}') center/cover no-repeat;
}
${hasWash ? `.wash{
  position:absolute;bottom:0;left:0;right:0;height:${washHeight}px;
  background:linear-gradient(to top,${washColor} 0%,rgba(0,0,0,0.4) 50%,transparent 100%);
  pointer-events:none;
}` : ""}
.logo{
  position:absolute;
  ${logoCSS}
  width:${logoW}px;
  height:auto;
  object-fit:contain;
  max-height:120px;
}
.text-zone{
  position:absolute;
  bottom:${textBottom}px;
  left:60px;right:60px;
  text-align:center;
}
${data.preHeadline ? `.pre-hl{
  font-family:'Montserrat',sans-serif;
  font-weight:400;
  font-size:32px;
  letter-spacing:0.12em;
  text-transform:uppercase;
  color:rgba(255,255,255,0.85);
  text-shadow:0 1px 6px rgba(0,0,0,0.7);
  margin-bottom:12px;
  overflow:hidden;
  word-break:break-word;
}` : ""}
.hl{
  font-family:'Montserrat',sans-serif;
  font-weight:900;
  font-size:${headlineSize}px;
  line-height:1.08;
  text-transform:uppercase;
  color:${textColor};
  text-shadow:0 2px 12px rgba(0,0,0,0.6),0 0 30px rgba(0,0,0,0.3);
  letter-spacing:-0.01em;
  overflow:hidden;
  word-break:break-word;
  margin-bottom:4px;
}
${data.captionFirstLine ? `.cap-line{
  font-family:'Montserrat',sans-serif;
  font-weight:400;
  font-size:30px;
  color:rgba(255,255,255,0.8);
  text-shadow:0 1px 6px rgba(0,0,0,0.7);
  margin-top:16px;
  overflow:hidden;
  word-break:break-word;
}` : ""}
.footer{
  position:absolute;
  bottom:${logoPos.startsWith("bottom") ? 50 : 40}px;
  left:0;right:0;
  text-align:center;
  font-family:'Montserrat',sans-serif;
  font-weight:400;
  font-size:26px;
  letter-spacing:0.08em;
  color:rgba(255,255,255,0.7);
  text-shadow:0 1px 4px rgba(0,0,0,0.5);
}
.divider{
  width:80px;height:1px;
  background:rgba(255,255,255,0.4);
  margin:8px auto;
}
</style>
</head>
<body>
<div class="canvas">
  ${hasWash ? '<div class="wash"></div>' : ""}

  ${data.logoUrl && logoPos !== "none" ? `<img src="${data.logoUrl}" class="logo" alt="${data.brandName}">` : ""}

  <div class="text-zone">
    ${data.preHeadline ? `<div class="pre-hl">${data.preHeadline}</div>` : ""}
    <div class="hl auto-fit">${line1}</div>
    ${line2 ? `<div class="hl auto-fit">${line2}</div>` : ""}
    ${line3 ? `<div class="hl auto-fit">${line3}</div>` : ""}
    ${data.captionFirstLine ? `<div class="cap-line">${data.captionFirstLine}</div>` : ""}
  </div>

  ${!logoPos.startsWith("bottom") ? `<div class="footer">
    <div class="divider"></div>
    @${handle}
  </div>` : `<div class="footer">@${handle}</div>`}
</div>

<script>
(function(){
  document.querySelectorAll('.auto-fit').forEach(function(el){
    var par=el.parentElement;
    var maxW=(par?par.clientWidth:${W})-40;
    var fs=parseFloat(getComputedStyle(el).fontSize);
    el.style.whiteSpace='nowrap';
    while(el.scrollWidth>maxW&&fs>24){fs--;el.style.fontSize=fs+'px';}
    el.style.whiteSpace='';
  });
})();
</script>
</body>
</html>`;
}
