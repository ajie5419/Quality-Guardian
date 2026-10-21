import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const callbackQuerySchema = z.object({
  data: z.string().optional(),
  id: z.string().min(1),
  message: z.object({ message_id: z.number().int().optional() }).optional(),
});

export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

export const telegramUpdateSchema = z.object({
  callback_query: callbackQuerySchema.optional(),
});

/** Reject missing credentials before comparing equal-length UTF-8 buffers. */
export function isTelegramWebhookSecretValid(
  configuredSecret: string | undefined,
  presentedSecret: string | undefined,
): boolean {
  if (!configuredSecret || !presentedSecret) return false;
  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(presentedSecret);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
