import { z } from 'zod';
import { BusinessError } from '~/utils/business-error';

export const inspectionMaterialRequestListQuerySchema = z.object({
  keyword: z.string().trim().max(191).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['APPROVED', 'PENDING', 'REJECTED']).optional(),
});

export const inspectionMaterialRequestApproveSchema = z.discriminatedUnion(
  'mode',
  [
    z.object({
      mode: z.literal('CREATE'),
      name: z.string().trim().min(1).max(191).optional(),
      remark: z.string().trim().max(1000).optional(),
    }),
    z.object({
      mode: z.literal('LINK_EXISTING'),
      partId: z.string().trim().min(1),
      remark: z.string().trim().max(1000).optional(),
    }),
  ],
);

export const inspectionMaterialRequestRejectSchema = z.object({
  remark: z.string().trim().min(1).max(1000),
});

export type InspectionMaterialRequestApproveInput = z.infer<
  typeof inspectionMaterialRequestApproveSchema
>;
export type InspectionMaterialRequestListQuery = z.infer<
  typeof inspectionMaterialRequestListQuerySchema
>;
export type InspectionMaterialRequestRejectInput = z.infer<
  typeof inspectionMaterialRequestRejectSchema
>;

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  input: unknown,
  message: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BusinessError('BAD_REQUEST', message, 400);
  }
  return result.data;
}

export function parseInspectionMaterialRequestListQuery(input: unknown) {
  return parseOrThrow(
    inspectionMaterialRequestListQuerySchema,
    input,
    'Invalid material request query',
  );
}

export function parseInspectionMaterialRequestApproveInput(input: unknown) {
  return parseOrThrow(
    inspectionMaterialRequestApproveSchema,
    input,
    'Invalid material approval input',
  );
}

export function parseInspectionMaterialRequestRejectInput(input: unknown) {
  return parseOrThrow(
    inspectionMaterialRequestRejectSchema,
    input,
    'A rejection remark is required',
  );
}
