import { z } from 'zod';

const optionalTeamIdentityFields = {
  responsibleTeam: z.string().trim().min(1).optional(),
  responsibleTeamId: z.string().trim().min(1).optional(),
};

const editableTeamIdentityFields = {
  responsibleTeam: z.string().trim().min(1).nullable().optional(),
  responsibleTeamId: z.string().trim().min(1).nullable().optional(),
};

function validateTeamIdentityPair(
  body: {
    responsibleTeam?: null | string;
    responsibleTeamId?: null | string;
  },
  context: z.RefinementCtx,
) {
  if (
    (body.responsibleTeam === undefined) !==
      (body.responsibleTeamId === undefined) ||
    (body.responsibleTeam === null) !== (body.responsibleTeamId === null)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'responsibleTeam and responsibleTeamId must be provided together',
      path:
        body.responsibleTeam === undefined
          ? ['responsibleTeam']
          : ['responsibleTeamId'],
    });
  }
}

export const workOrderRequirementPayloadSchema = z
  .object({
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    identityContractVersion: z.literal(2),
    items: z.array(z.unknown()).optional(),
    partId: z.string().trim().min(1).optional(),
    processId: z.string().trim().min(1).optional(),
    requirementName: z.string().trim().min(1),
    responsiblePerson: z.string().trim().min(1).optional(),
    ...optionalTeamIdentityFields,
    workOrderNumber: z.string().trim().min(1),
  })
  .strict()
  .superRefine(validateTeamIdentityPair);

export const workOrderRequirementCreateBodySchema = z.union([
  workOrderRequirementPayloadSchema,
  z
    .object({
      requirements: z.array(workOrderRequirementPayloadSchema).min(1),
    })
    .strict(),
]);

export const workOrderRequirementUpdateBodySchema = z
  .object({
    attachments: z.array(z.record(z.string(), z.unknown())).optional(),
    identityContractVersion: z.literal(2),
    items: z.array(z.unknown()).optional(),
    partId: z.string().trim().min(1).nullable().optional(),
    processId: z.string().trim().min(1).nullable().optional(),
    requirementName: z.string().trim().min(1).optional(),
    responsiblePerson: z.string().trim().min(1).nullable().optional(),
    ...editableTeamIdentityFields,
  })
  .strict()
  .superRefine(validateTeamIdentityPair)
  .refine(
    (body) =>
      Object.keys(body).some((key) => key !== 'identityContractVersion'),
    {
      message: 'At least one editable field is required',
    },
  );

export const workOrderRequirementConfirmBodySchema = z
  .object({ confirm: z.boolean() })
  .strict();

export const workOrderRequirementMutationBodySchema = z.union([
  workOrderRequirementConfirmBodySchema,
  workOrderRequirementUpdateBodySchema,
]);
