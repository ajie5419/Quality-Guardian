import { z } from 'zod';

export const FULFILLMENT_SYNC_MAX_LIMIT = 100;

export const FULFILLMENT_SYNC_RESOURCES = [
  'work-orders',
  'suppliers',
  'processes',
  'departments',
  'users',
  'inspections',
] as const;

export type FulfillmentSyncResource =
  (typeof FULFILLMENT_SYNC_RESOURCES)[number];

const emptyToUndefined = (value: unknown) =>
  value === '' || value === null ? undefined : value;

export const fulfillmentSyncQuerySchema = z
  .object({
    afterId: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(1).max(191).optional(),
    ),
    limit: z.preprocess(
      emptyToUndefined,
      z.coerce
        .number()
        .int()
        .min(1)
        .max(FULFILLMENT_SYNC_MAX_LIMIT)
        .default(FULFILLMENT_SYNC_MAX_LIMIT),
    ),
    since: z.preprocess(
      emptyToUndefined,
      z.string().datetime({ offset: true }).optional(),
    ),
  })
  .refine((value) => !value.afterId || value.since, {
    message: 'afterId requires since',
    path: ['afterId'],
  });

export type FulfillmentSyncQuery = z.infer<typeof fulfillmentSyncQuerySchema>;
