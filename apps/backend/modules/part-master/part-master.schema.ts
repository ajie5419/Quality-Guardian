import { z } from 'zod';

const partNameSchema = z.string().trim().min(1).max(191);
const partSortSchema = z.number().int().min(0).max(9999).optional();

export const partMasterCreateSchema = z.object({
  name: partNameSchema,
  sort: partSortSchema,
});

export const partMasterUpdateSchema = z
  .object({
    name: partNameSchema.optional(),
    sort: partSortSchema,
    status: z.union([z.literal(0), z.literal(1)]).optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.sort !== undefined ||
      input.status !== undefined,
    { message: 'At least one field must be provided' },
  );

export const partMasterManagementQuerySchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.coerce
    .number()
    .pipe(z.union([z.literal(0), z.literal(1)]))
    .optional(),
});

export const partMasterRemoteSearchSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  take: z.coerce.number().int().positive().max(50).default(20),
});

export const partMasterIdSchema = z.string().trim().min(1).max(191);

export type PartMasterCreateInput = z.infer<typeof partMasterCreateSchema>;
export type PartMasterManagementQuery = z.infer<
  typeof partMasterManagementQuerySchema
>;
export type PartMasterRemoteSearchInput = z.infer<
  typeof partMasterRemoteSearchSchema
>;
export type PartMasterUpdateInput = z.infer<typeof partMasterUpdateSchema>;
