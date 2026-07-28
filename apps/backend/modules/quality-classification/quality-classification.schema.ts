import { QUALITY_CLASSIFICATION_SCOPES } from '@qgs/shared';
import { z } from 'zod';

export const qualityClassificationScopeSchema = z.enum(
  QUALITY_CLASSIFICATION_SCOPES,
);

const idSchema = z.string().trim().min(1).max(191);
const nameSchema = z.string().trim().min(1).max(191);
const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\w-]+$/)
  .nullable()
  .optional();
const sortSchema = z.number().int().min(0).max(9999).optional();
const statusSchema = z.union([z.literal(0), z.literal(1)]);

export const qualityClassificationQuerySchema = z.object({
  scope: qualityClassificationScopeSchema,
});

export const qualityClassificationCategoryCreateSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  scope: qualityClassificationScopeSchema,
  sort: sortSchema,
  status: statusSchema.optional(),
});

export const qualityClassificationCategoryUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    sort: sortSchema,
    status: statusSchema.optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.sort !== undefined ||
      input.status !== undefined,
    { message: 'At least one field must be provided' },
  );

export const qualityClassificationSubcategoryCreateSchema = z.object({
  categoryId: idSchema,
  code: codeSchema,
  name: nameSchema,
  sort: sortSchema,
  status: statusSchema.optional(),
});

export const qualityClassificationSubcategoryUpdateSchema =
  qualityClassificationCategoryUpdateSchema;

export const qualityClassificationIdSchema = idSchema;

export type QualityClassificationCategoryCreateInput = z.infer<
  typeof qualityClassificationCategoryCreateSchema
>;
export type QualityClassificationCategoryUpdateInput = z.infer<
  typeof qualityClassificationCategoryUpdateSchema
>;
export type QualityClassificationSubcategoryCreateInput = z.infer<
  typeof qualityClassificationSubcategoryCreateSchema
>;
export type QualityClassificationSubcategoryUpdateInput = z.infer<
  typeof qualityClassificationSubcategoryUpdateSchema
>;
