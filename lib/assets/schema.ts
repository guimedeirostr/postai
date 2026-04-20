import { z } from 'zod';

export const AssetRoleSchema = z.enum(['logo', 'product', 'person', 'background']);

export const AssetSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug deve ser kebab-case (ex: logo-principal)');

export const AssetMimeSchema = z.enum(['image/png', 'image/jpeg', 'image/webp']);

export const AssetCreateSchema = z.object({
  role:        AssetRoleSchema,
  slug:        AssetSlugSchema,
  label:       z.string().min(2).max(80),
  description: z.string().max(300).optional(),
  mimeType:    AssetMimeSchema,
  bytes:       z.number().int().positive().max(10 * 1024 * 1024),
  width:       z.number().int().positive().optional(),
  height:      z.number().int().positive().optional(),
});

export const AssetUpdateSchema = z
  .object({
    role:        AssetRoleSchema.optional(),
    slug:        AssetSlugSchema.optional(),
    label:       z.string().min(2).max(80).optional(),
    description: z.string().max(300).optional(),
    preferred:   z.boolean().optional(),
    active:      z.boolean().optional(),
  })
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'Pelo menos um campo deve ser atualizado',
  });

export type AssetCreateData = z.infer<typeof AssetCreateSchema>;
export type AssetUpdateData = z.infer<typeof AssetUpdateSchema>;
