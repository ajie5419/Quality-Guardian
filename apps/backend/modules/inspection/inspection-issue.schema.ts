import { INSPECTION_ISSUE_FIELD_LIMITS } from '@qgs/shared';
import { z } from 'zod';
import { BusinessError } from '~/utils/business-error';

const shortText = z
  .string()
  .trim()
  .max(INSPECTION_ISSUE_FIELD_LIMITS.SHORT_TEXT);
const requiredText = shortText.min(1, '必填字段不能为空');
const longText = z
  .string()
  .trim()
  .max(INSPECTION_ISSUE_FIELD_LIMITS.DESCRIPTION);
const requiredLongText = longText.min(1, '必填字段不能为空');
const optionalNcNumber = z.preprocess(
  (value) => (String(value ?? '').trim() ? value : undefined),
  z.string().trim().max(INSPECTION_ISSUE_FIELD_LIMITS.NC_NUMBER).optional(),
);
const photoSchema = z.union([
  z.string().trim().min(1),
  z
    .object({
      fileId: z.string().trim().optional(),
      name: z.string().trim().optional(),
      url: z.string().trim().min(1),
    })
    .passthrough(),
]);

const issueFields = {
  category: shortText.optional(),
  claim: z.union([z.enum(['No', 'Yes']), z.boolean()]).optional(),
  defectSubtype: requiredText,
  defectType: requiredText,
  description: requiredLongText,
  division: shortText.optional(),
  id: shortText.optional(),
  inspectionId: shortText.optional(),
  inspector: shortText.optional(),
  lossAmount: z.coerce.number().finite().min(0).optional(),
  ncNumber: optionalNcNumber,
  partName: requiredText,
  photos: z
    .array(photoSchema)
    .max(INSPECTION_ISSUE_FIELD_LIMITS.PHOTOS)
    .optional(),
  processName: requiredText,
  projectName: shortText.optional(),
  quantity: z.coerce.number().int().positive(),
  reportDate: z
    .string()
    .trim()
    .min(1, '发现日期不能为空')
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      '发现日期无效',
    ),
  reportedBy: shortText.optional(),
  responsibleDepartment: shortText.optional(),
  responsibleDepartments: z.array(requiredText).min(1).max(20).optional(),
  responsibleWelder: shortText.optional(),
  rootCause: requiredLongText,
  severity: z.enum(['Critical', 'Major', 'Minor']),
  solution: requiredLongText,
  sourceType: shortText.optional(),
  status: z.enum(['CLOSED', 'IN_PROGRESS', 'OPEN']),
  supplierId: shortText.optional(),
  supplierName: shortText.optional(),
  workOrderNumber: requiredText,
};

const createSchema = z
  .object(issueFields)
  .strict()
  .refine(
    (value) =>
      Boolean(value.responsibleDepartment) ||
      Boolean(value.responsibleDepartments?.length),
    {
      message: '责任部门不能为空',
      path: ['responsibleDepartment'],
    },
  );

const updateSchema = z
  .object(issueFields)
  .partial()
  .strict()
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, item]) => key !== 'id' && item !== undefined,
      ),
    '至少提供一个可更新字段',
  );

function parseIssueBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BusinessError(
      'VALIDATION',
      result.error.issues[0]?.message || '不合格品项参数无效',
      400,
    );
  }
  return result.data;
}

export function parseInspectionIssueCreateBody(input: unknown) {
  return parseIssueBody(createSchema, input);
}

export function parseInspectionIssueUpdateBody(input: unknown) {
  return parseIssueBody(updateSchema, input);
}
