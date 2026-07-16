import { z } from 'zod';

const welderFields = {
  certificationNo: z.string().nullable().optional(),
  employmentStatus: z.enum(['ON_DUTY', 'RESIGNED']).optional(),
  examDate: z.string().nullable().optional(),
  examPassed: z.boolean().optional(),
  name: z.string().trim().min(1),
  score: z.number().min(0).max(12).optional(),
  team: z.string().trim().min(1),
  teamId: z.string().trim().min(1),
  welderCode: z.string().nullable().optional(),
  welding_method: z.string().nullable().optional(),
};

export const welderCreateBodySchema = z.object(welderFields).strict();

export const welderUpdateBodySchema = z
  .object(welderFields)
  .partial()
  .strict()
  .superRefine((body, context) => {
    if ((body.team === undefined) !== (body.teamId === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'team and teamId must be provided together',
        path: body.team === undefined ? ['team'] : ['teamId'],
      });
    }
  });
