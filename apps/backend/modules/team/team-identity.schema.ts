import { z } from 'zod';

const teamNameSchema = z.string().trim().min(1).max(191);
const teamRemarkSchema = z.string().trim().max(2000).nullable().optional();

export const teamIdentityCreateSchema = z.object({
  name: teamNameSchema,
  remark: teamRemarkSchema,
  sort: z.number().int().min(0).max(9999).optional(),
});

export const teamIdentityUpdateSchema = z
  .object({
    name: teamNameSchema.optional(),
    remark: teamRemarkSchema,
    sort: z.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (input) =>
      input.name !== undefined ||
      input.remark !== undefined ||
      input.sort !== undefined,
    { message: 'At least one field must be provided' },
  );

export const teamIdentityListQuerySchema = z.object({
  keyword: z.string().trim().max(191).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const teamIdentityMergeSchema = z
  .object({
    reason: z.string().trim().min(1).max(2000),
    sourceTeamId: z.string().trim().min(1).max(191),
    targetTeamId: z.string().trim().min(1).max(191),
  })
  .refine((input) => input.sourceTeamId !== input.targetTeamId, {
    message: 'Source and target TEAM IDs must be different',
    path: ['targetTeamId'],
  });

export type TeamIdentityCreateInput = z.infer<typeof teamIdentityCreateSchema>;
export type TeamIdentityListQuery = z.infer<typeof teamIdentityListQuerySchema>;
export type TeamIdentityMergeInput = z.infer<typeof teamIdentityMergeSchema>;
export type TeamIdentityUpdateInput = z.infer<typeof teamIdentityUpdateSchema>;
