// lib/ai/resolve-refs.ts
// Resolve @slug references in prompt text → asset URLs.
// @slug patterns: @img1, @avatar2, @logo, @gen3, etc.

import { getAssetBySlug } from "@/lib/firestore/queries";

const SLUG_RE = /@([a-zA-Z0-9_]+)/g;

export interface ResolvedRefs {
  resolved: { slug: string; url: string }[];
  missing:  string[];
}

export async function resolveRefs(
  uid:      string,
  clientId: string,
  text:     string,
): Promise<ResolvedRefs> {
  const rawSlugs = [...new Set([...text.matchAll(SLUG_RE)].map(m => `@${m[1]}`))];
  if (rawSlugs.length === 0) return { resolved: [], missing: [] };

  const resolved: { slug: string; url: string }[] = [];
  const missing:  string[]                         = [];

  // Parallel batch lookup
  await Promise.all(
    rawSlugs.map(async slug => {
      const asset = await getAssetBySlug(uid, clientId, slug);
      if (asset) {
        resolved.push({ slug, url: asset.url });
      } else {
        missing.push(slug);
      }
    })
  );

  return { resolved, missing };
}

// Remove @slug tokens from prompt text (refs are sent as reference_images, not in text)
export function stripSlugs(text: string): string {
  return text.replace(SLUG_RE, "").replace(/\s{2,}/g, " ").trim();
}
