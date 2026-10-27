import { WORK_ORDER_STATUS } from '@qgs/shared';
import { z } from 'zod';

const MAX_WORK_ORDER_NUMBER_LENGTH = 64;
const MAX_ID_LENGTH = 191;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const idSchema = z.string().trim().min(1).max(MAX_ID_LENGTH);

/** 'YYYY-MM-DD' that is a real calendar day (rejects 2026-02-30). */
const dateOnlySchema = z
  .string()
  .regex(DATE_ONLY_PATTERN)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const projectNameSchema = z
  .string()
  .trim()
  .max(MAX_ID_LENGTH)
  .nullable()
  .transform((value) => value || null);

const versionSchema = z.number().int().min(1);

export const fulfillmentWorkOrderNumberParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_ID_LENGTH);

export const fulfillmentWorkOrderCreateSchema = z.object({
  actorUserId: idSchema,
  customerNameId: idSchema,
  deliveryDate: dateOnlySchema,
  divisionId: idSchema.nullable().optional(),
  projectName: projectNameSchema.optional(),
  quantity: z.number().int().min(1),
  workOrderNumber: z.string().trim().min(1).max(MAX_WORK_ORDER_NUMBER_LENGTH),
});

export const fulfillmentWorkOrderUpdateSchema = z.object({
  actorUserId: idSchema,
  customerNameId: idSchema.optional(),
  deliveryDate: dateOnlySchema.optional(),
  divisionId: idSchema.nullable().optional(),
  projectName: projectNameSchema.optional(),
  quantity: z.number().int().min(1).optional(),
  // CANCELLED is only reachable through the cancel endpoint.
  status: z
    .enum([
      WORK_ORDER_STATUS.OPEN,
      WORK_ORDER_STATUS.IN_PROGRESS,
      WORK_ORDER_STATUS.COMPLETED,
    ])
    .optional(),
  version: versionSchema,
  // Accepted only so a renamed number can be rejected explicitly.
  workOrderNumber: z.string().optional(),
});

export const fulfillmentWorkOrderCancelSchema = z.object({
  actorUserId: idSchema,
  version: versionSchema,
});

export type FulfillmentWorkOrderCreateInput = z.infer<
  typeof fulfillmentWorkOrderCreateSchema
>;
export type FulfillmentWorkOrderUpdateInput = z.infer<
  typeof fulfillmentWorkOrderUpdateSchema
>;
export type FulfillmentWorkOrderCancelInput = z.infer<
  typeof fulfillmentWorkOrderCancelSchema
>;

const FIELD_LABELS: Record<string, string> = {
  actorUserId: '操作人',
  customerNameId: '客户',
  deliveryDate: '交付日期',
  divisionId: '事业部',
  projectName: '项目名称',
  quantity: '数量',
  status: '状态',
  version: '版本号',
  workOrderNumber: '工单号',
};

/** Chinese message naming the first invalid field, shown to fulfillment users. */
export function describeIntegrationValidationError(error: z.ZodError) {
  const field = String(error.issues[0]?.path[0] ?? '');
  return `参数错误：${FIELD_LABELS[field] ?? (field || '请求体')}`;
}
