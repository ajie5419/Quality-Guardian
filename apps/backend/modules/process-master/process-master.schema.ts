import { z } from 'zod';

export const inspectionRequestProcessCategorySchema = z.enum([
  'INCOMING',
  'PROCESS',
]);

const processNameSchema = z.string().trim().min(1).max(191);
const processCodeSchema = z.string().trim().max(191).nullable().optional();
const processSortSchema = z.number().int().min(0).max(9999).optional();
const processSupplierSourceSchema = z
  .enum(['Outsourcing', 'Supplier'])
  .default('Supplier');

export const processMasterCreateSchema = z.object({
  categories: z
    .array(inspectionRequestProcessCategorySchema)
    .max(2)
    .default([]),
  code: processCodeSchema,
  name: processNameSchema,
  sort: processSortSchema,
  supplierSource: processSupplierSourceSchema,
});

export const processMasterUpdateSchema = z
  .object({
    code: processCodeSchema,
    name: processNameSchema.optional(),
    sort: processSortSchema,
    status: z.union([z.literal(0), z.literal(1)]).optional(),
    supplierSource: processSupplierSourceSchema.optional(),
  })
  .refine(
    (input) =>
      input.code !== undefined ||
      input.name !== undefined ||
      input.sort !== undefined ||
      input.status !== undefined ||
      input.supplierSource !== undefined,
    { message: 'At least one field must be provided' },
  );

export const inspectionRequestProcessSelectionSchema = z.object({
  incomingProcessIds: z.array(z.string().trim().min(1).max(191)).max(500),
  processProcessIds: z.array(z.string().trim().min(1).max(191)).max(500),
});

export const processMasterIdSchema = z.string().trim().min(1).max(191);

export type InspectionRequestProcessCategory = z.infer<
  typeof inspectionRequestProcessCategorySchema
>;
export type InspectionRequestProcessSelectionInput = z.infer<
  typeof inspectionRequestProcessSelectionSchema
>;
export type ProcessMasterCreateInput = z.infer<
  typeof processMasterCreateSchema
>;
export type ProcessMasterUpdateInput = z.infer<
  typeof processMasterUpdateSchema
>;
