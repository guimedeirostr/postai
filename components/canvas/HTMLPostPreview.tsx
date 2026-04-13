"use client";

/**
 * HTMLPostPreview
 *
 * Renderiza um preview ao vivo do post como HTML real num iframe escalado.
 * O HTML usa Google Fonts e CSS completo — o que você vê é o que o Chrome renderiza.
 */

import { useMemo } from "react";
import { buildGenericTemplate, type GenericTemplateData } from "@/lib/prompts/generic-template";

export interface HTMLPostPreviewProps {
  // Image + content
  imageUrl:          string;
  headline:          string;
  brandName:         string;
  instagramHandle?:  string;
  brandColor:        string;
  secondaryColor:    string;
  logoUrl?:          string | null;
  preHeadline?:      string;
  captionFirstLine?: string;
  // Compositor controls
  headlineColor?:    string;
  accentColor?:      string;
  gradientOverlay?:  boolean;
  textBgOverlay?:    boolean;
  textPosition?:     string;
  fontStyleHint?:    string;
  logoOverlay?:      boolean;
  logoPlacement?:    string;
  footerVisible?:    boolean;
  footerOverlay?:    boolean;
  // Preview size
  previewWidth?:     number;  // default: 340
  className?:        string;
}

const CANVAS_W = 1080;
const CANVAS_H = 1350;

export default function HTMLPostPreview({
  imageUrl, headline, brandName, instagramHandle, brandColor, secondaryColor,
  logoUrl, preHeadline, captionFirstLine,
  headlineColor, accentColor, gradientOverlay, textBgOverlay, textPosition,
  fontStyleHint, logoOverlay, logoPlacement, footerVisible, footerOverlay,
  previewWidth = 340,
  className = "",
}: HTMLPostPreviewProps) {

  const scale         = previewWidth / CANVAS_W;
  const previewHeight = Math.round(CANVAS_H * scale);

  const html = useMemo<string>(() => {
    if (!imageUrl) return "";
    const data: GenericTemplateData = {
      photoUrl:              imageUrl,
      headline:              headline || "",
      preHeadline:           preHeadline || "",
      captionFirstLine:      captionFirstLine || "",
      logoUrl:               logoUrl || "",
      brandColor:            brandColor || "#6d28d9",
      secondaryColor:        secondaryColor || "#8b5cf6",
      brandName:             brandName || "",
      instagramHandle:       instagramHandle || "",
      format:                "feed",
      headlineColor,
      accentColor,
      gradientOverlay,
      textBgOverlay,
      textPosition,
      fontStyleHint,
      logoOverlay,
      logoPlacementOverride: logoPlacement,
      footerVisible,
      footerOverlay,
    };
    return buildGenericTemplate(data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    imageUrl, headline, brandName, instagramHandle, brandColor, secondaryColor,
    logoUrl, preHeadline, captionFirstLine,
    headlineColor, accentColor, gradientOverlay, textBgOverlay, textPosition,
    fontStyleHint, logoOverlay, logoPlacement, footerVisible, footerOverlay,
  ]);

  if (!html) return null;

  return (
    <div
      className={className}
      style={{
        width:         previewWidth,
        height:        previewHeight,
        overflow:      "hidden",
        position:      "relative",
        borderRadius:  8,
        flexShrink:    0,
      }}
    >
      <iframe
        srcDoc={html}
        title="Post preview"
        style={{
          width:            CANVAS_W,
          height:           CANVAS_H,
          transform:        `scale(${scale})`,
          transformOrigin:  "top left",
          border:           "none",
          pointerEvents:    "none",
          display:          "block",
        }}
      />
    </div>
  );
}

/** Export the HTML generator so CompositorNode can use it for the refine button */
export { buildGenericTemplate };
export type { GenericTemplateData };
