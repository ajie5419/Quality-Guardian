import { z } from 'zod';

export const masterDataGovernanceQuerySchema = z.object({
  entityType: z.string().trim().optional(),
  fieldName: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['IGNORED', 'OPEN', 'RESOLVED']).default('OPEN'),
});

export const masterDataGovernanceResolutionSchema = z.discriminatedUnion(
  'resolutionType',
  [
    z.object({
      canonicalIds: z.array(z.string().trim().min(1)).min(1).max(100),
      note: z.string().trim().max(1000).default(''),
      resolutionType: z.literal('IDENTITY'),
    }),
    z.object({
      categoryId: z.string().trim().min(1),
      note: z.string().trim().max(1000).default(''),
      resolutionType: z.literal('CLASSIFICATION'),
      subcategoryId: z.string().trim().min(1),
    }),
    z.object({
      departmentId: z.string().trim().min(1),
      note: z.string().trim().max(1000).default(''),
      resolutionType: z.literal('DEPARTMENT'),
    }),
    z.object({
      note: z.string().trim().max(1000).default(''),
      processId: z.string().trim().min(1),
      resolutionType: z.literal('PROCESS'),
    }),
  ],
);

export const masterDataGovernanceOptionsQuerySchema = z.object({
  keyword: z.string().trim().max(100).default(''),
});
