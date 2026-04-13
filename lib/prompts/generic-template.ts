/**
 * lib/prompts/generic-template.ts
 *
 * Gera um template HTML/CSS para o Chromium renderer.
 * Suporta todos os controles do Compositor: fontes, cores, posição do texto,
 * gradiente, overlays, logo, rodapé.
 */

import type { LayerStack } from "@/types";

// ── Font pair configs (Google Fonts) ─────────────────────────────────────────

const FONT_PAIR_CONFIG: Record<string, {
  googleParams:     string;
  headlineFamily:   string;
  headlineWeight:   number;
  headlineTransform: string;
  bodyFamily:       string;
}> = {
  "": {
    googleParams:      "Montserrat:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,600;1,400",
    headlineFamily:    "Montserrat",
    headlineWeight:    900,
    headlineTransform: "uppercase",
    bodyFamily:        "Cormorant Garamond",
  },
  "serif": {
    googleParams:      "Playfair+Display:ital,wght@0,700;0,900;1,600&family=Raleway:wght@400;500",
    headlineFamily:    "Playfair Display",
    headlineWeight:    700,
    headlineTransform: "none",
    bodyFamily:        "Raleway",
  },
  "script": {
    googleParams:      "Caveat:wght@700&family=Karla:wght@400;500",
    headlineFamily:    "Caveat",
    headlineWeight:    700,
    headlineTransform: "none",
    bodyFamily:        "Karla",
  },
  "minimal": {
    googleParams:      "Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@400;500",
    headlineFamily:    "Plus Jakarta Sans",
    headlineWeight:    800,
    headlineTransform: "none",
    bodyFamily:        "Inter",
  },
};

// ── Helper ────────────────────────────────────────────────────────────────────

function hexToRgbStr(hex: string): string {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return `${r},${g},${b}`;
}

// ── Interface ─────────────────────────────────────────────────────────────────

export interface GenericTemplateData {
  photoUrl:          string;
  headline:          string;
  preHeadline:       string;
  captionFirstLine:  string;
  logoUrl:           string;
  brandColor:        string;
  secondaryColor:    string;
  brandName:         string;
  instagramHandle:   string;
  format:            "feed" | "stories" | "reels_cover";
  layer_stack?:      LayerStack;

  // ── Compositor controls (all optional, with sensible defaults) ──────────────
  /** Cor da linha 1 do headline (padrão: #ffffff) */
  headlineColor?:        string;
  /** Cor da linha 2 / acento (padrão: secondaryColor) */
  accentColor?:          string;
  /** Exibe gradiente wash (padrão: true) */
  gradientOverlay?:      boolean;
  /** Caixa semi-transparente atrás do texto (padrão: false) */
  textBgOverlay?:        boolean;
  /** Posição do texto: "top"|"center"|"bottom-left"|"bottom-full" (padrão: "bottom-full") */
  textPosition?:         string;
  /** Hint de estilo tipográfico: ""|"serif"|"script"|"minimal" */
  fontStyleHint?:        string;
  /** Badge de fundo atrás do logo (padrão: true) */
  logoOverlay?:          boolean;
  /** Override de posição do logo */
  logoPlacementOverride?: string;
  /** Exibe rodapé (padrão: true) */
  footerVisible?:        boolean;
  /** Rodapé semi-transparente (padrão: false) */
  footerOverlay?:        boolean;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function buildGenericTemplate(data: GenericTemplateData): string {
  const W = 1080;
  const H = data.format === "feed" ? 1350 : 1920;

  const ls = data.layer_stack;

  // ── Font pair ──────────────────────────────────────────────────────────────
  const fontHint   = data.fontStyleHint ?? "";
  const fontCfg    = FONT_PAIR_CONFIG[fontHint] ?? FONT_PAIR_CONFIG[""];
  const googleFont = `https://fonts.googleapis.com/css2?family=${fontCfg.googleParams}&display=swap`;

  // ── Colors ────────────────────────────────────────────────────────────────
  const hl1Color  = data.headlineColor  ?? "#ffffff";
  const hl2Color  = data.accentColor    ?? data.secondaryColor;
  const brandRgb  = hexToRgbStr(data.brandColor);

  // ── Gradient / wash ───────────────────────────────────────────────────────
  const showGrad    = data.gradientOverlay !== false;
  const washType    = ls?.wash?.type ?? "gradient";
  const hasWash     = showGrad && washType !== "none";
  const washColor   = ls?.wash?.color ?? "rgba(0,0,0,0.75)";
  const washHeight  = Math.round(H * 0.50);

  // ── Logo placement ────────────────────────────────────────────────────────
  const rawLogoPos  = data.logoPlacementOverride
    ?? ls?.brand_elements?.logo_position
    ?? "top-left";
  const logoPos     = rawLogoPos === "none" ? "none" : rawLogoPos;
  const logoSize    = ls?.brand_elements?.logo_size ?? "medium";
  const logoW       = logoSize === "large" ? 260 : logoSize === "small" ? 120 : 180;
  const showLogoBadge = data.logoOverlay !== false && logoPos !== "none";

  const logoPositionCSS = (() => {
    switch (logoPos) {
      case "top-left":     return `top:44px;left:44px;`;
      case "top-right":    return `top:44px;right:44px;`;
      case "top-center":   return `top:44px;left:50%;transform:translateX(-50%);`;
      case "bottom-left":  return `bottom:${H * 0.1}px;left:44px;`;
      case "bottom-right": return `bottom:${H * 0.1}px;right:44px;`;
      case "bottom-center":return `bottom:${H * 0.1}px;left:50%;transform:translateX(-50%);`;
      default:             return `top:44px;left:44px;`;
    }
  })();

  // ── Text position ─────────────────────────────────────────────────────────
  const footerH     = data.footerVisible !== false ? 110 : 0;
  const textPosCSS  = (() => {
    switch (data.textPosition) {
      case "top":
        return `top:80px;left:60px;right:60px;text-align:left;`;
      case "center":
        return `top:50%;left:60px;right:60px;transform:translateY(-50%);text-align:center;`;
      case "bottom-left":
        return `bottom:${footerH + 60}px;left:60px;right:${Math.round(W * 0.45)}px;text-align:left;`;
      default: // bottom-full
        return `bottom:${footerH + 60}px;left:60px;right:60px;text-align:center;`;
    }
  })();

  // ── Text bg overlay ───────────────────────────────────────────────────────
  const textBgCss = data.textBgOverlay
    ? `background:rgba(0,0,0,0.45);border-radius:10px;padding:18px 22px;display:inline-block;`
    : ``;

  // ── Footer ────────────────────────────────────────────────────────────────
  const showFooter  = data.footerVisible !== false;
  const footerBg    = data.footerOverlay
    ? `rgba(${brandRgb},0.65)`
    : data.brandColor;
  const footerBorder = data.footerOverlay
    ? `none`
    : `3px solid ${data.secondaryColor}`;
  const handle = data.instagramHandle.replace(/^@/, "");

  // ── Headline split ────────────────────────────────────────────────────────
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
  const maxLen = Math.max(line1.length, line2.length, line3.length || 0);
  const headlineSize = maxLen > 20 ? 72 : maxLen > 15 ? 88 : 108;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${googleFont}" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:${W}px;height:${H}px;overflow:hidden;background:#111;}
.canvas{
  position:relative;width:${W}px;height:${H}px;overflow:hidden;
  background:url('${data.photoUrl}') center/cover no-repeat;
}
${hasWash ? `.wash{
  position:absolute;bottom:${footerH}px;left:0;right:0;height:${washHeight}px;
  background:linear-gradient(to top,${washColor} 0%,rgba(0,0,0,0.35) 55%,transparent 100%);
  pointer-events:none;
}` : ""}
${data.preHeadline ? `.pre-hl{
  font-family:'${fontCfg.bodyFamily}',sans-serif;
  font-weight:400;font-size:30px;letter-spacing:0.14em;text-transform:uppercase;
  color:rgba(255,255,255,0.82);text-shadow:0 1px 6px rgba(0,0,0,0.7);
  margin-bottom:10px;word-break:break-word;
}` : ""}
.hl{
  font-family:'${fontCfg.headlineFamily}',sans-serif;
  font-weight:${fontCfg.headlineWeight};
  font-size:${headlineSize}px;line-height:1.06;
  text-transform:${fontCfg.headlineTransform};
  color:${hl1Color};
  text-shadow:0 2px 14px rgba(0,0,0,0.65),0 0 40px rgba(0,0,0,0.25);
  letter-spacing:-0.01em;word-break:break-word;margin-bottom:3px;
}
.hl.accent{color:${hl2Color};}
${data.captionFirstLine ? `.cap-line{
  font-family:'${fontCfg.bodyFamily}',sans-serif;
  font-weight:400;font-size:28px;
  color:rgba(255,255,255,0.78);text-shadow:0 1px 6px rgba(0,0,0,0.7);
  margin-top:14px;word-break:break-word;
}` : ""}
.text-zone{position:absolute;${textPosCSS}}
.text-inner{${textBgCss}}
${showFooter ? `.footer{
  position:absolute;bottom:0;left:0;right:0;height:${footerH}px;
  background:${footerBg};border-top:${footerBorder};
  display:flex;align-items:center;justify-content:space-between;
  padding:0 50px;
}
.footer-name{color:#fff;font-size:26px;font-family:'${fontCfg.bodyFamily}',sans-serif;font-weight:700;letter-spacing:0.06em;}
.footer-handle{color:${hl2Color};font-size:26px;font-family:'${fontCfg.bodyFamily}',sans-serif;font-weight:700;letter-spacing:0.04em;}` : ""}
${logoPos !== "none" && data.logoUrl ? `.logo-wrap{
  position:absolute;${logoPositionCSS}
  ${showLogoBadge ? `background:rgba(${brandRgb},0.55);border-radius:10px;padding:8px;` : ""}
  display:inline-flex;align-items:center;justify-content:center;
}
.logo{width:${logoW}px;height:auto;max-height:100px;object-fit:contain;}` : ""}
</style>
</head>
<body>
<div class="canvas">
  ${hasWash ? '<div class="wash"></div>' : ""}

  ${logoPos !== "none" && data.logoUrl ? `<div class="logo-wrap"><img src="${data.logoUrl}" class="logo" alt="${data.brandName}"></div>` : ""}

  <div class="text-zone">
    <div class="text-inner">
      ${data.preHeadline ? `<div class="pre-hl">${data.preHeadline}</div>` : ""}
      <div class="hl auto-fit">${line1}</div>
      ${line2 ? `<div class="hl accent auto-fit">${line2}</div>` : ""}
      ${line3 ? `<div class="hl auto-fit">${line3}</div>` : ""}
      ${data.captionFirstLine ? `<div class="cap-line">${data.captionFirstLine}</div>` : ""}
    </div>
  </div>

  ${showFooter ? `<div class="footer">
    <span class="footer-name">${data.brandName.toUpperCase()}</span>
    ${handle ? `<span class="footer-handle">@${handle}</span>` : ""}
  </div>` : ""}
</div>
<script>
(function(){
  document.querySelectorAll('.auto-fit').forEach(function(el){
    var par=el.closest('.text-inner')||el.parentElement;
    var maxW=(par?par.clientWidth:${W})-40;
    var fs=parseFloat(getComputedStyle(el).fontSize);
    el.style.whiteSpace='nowrap';
    while(el.scrollWidth>maxW&&fs>20){fs--;el.style.fontSize=fs+'px';}
    el.style.whiteSpace='';
  });
})();
</script>
</body>
</html>`;
}
