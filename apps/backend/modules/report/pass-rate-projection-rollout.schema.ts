import { z } from 'zod';

export const passRateProjectionToggleSchema = z.object({
  enabled: z.boolean(),
});

export const passRateProjectionRebuildSchema = z.object({
  reason: z.string().trim().max(160).optional(),
});
