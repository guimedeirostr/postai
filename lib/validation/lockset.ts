import { z } from 'zod';

export const lockScopeSchema = z.enum([
  'typography', 'color', 'composition', 'signature', 'cta', 'tone', 'forbidden',
]);

export const enforcementSchema = z.enum(['hard', 'soft']);

export const formatKeySchema = z.enum([
  'ig_feed', 'ig_carousel', 'ig_stories', 'ig_reels_cover',
  'li_post_square', 'li_post_horizontal', 'li_carousel_pdf', 'li_article',
]);

export const lockSlideTypeSchema = z.enum([
  'single', 'carousel_opener', 'carousel_middle', 'carousel_cta', 'stories', 'reels_cover',
]);

export const lockCreateSchema = z.object({
  scope:       lockScopeSchema,
  description: z.string().min(3).max(200),
  enforcement: enforcementSchema,
  promptHint:  z.string().min(10).max(500),
  appliesTo: z.object({
    formats:    z.array(formatKeySchema).optional(),
    slideTypes: z.array(lockSlideTypeSchema).optional(),
  }).optional(),
  source: z.enum(['manual', 'dna_visual', 'user_approved_pattern']).default('manual'),
});

export const lockUpdateSchema = lockCreateSchema.partial();

export type LockCreateInput = z.infer<typeof lockCreateSchema>;
export type LockUpdateInput = z.infer<typeof lockUpdateSchema>;
