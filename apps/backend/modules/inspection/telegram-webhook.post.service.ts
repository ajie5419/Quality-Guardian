import process from 'node:process';

import { defineEventHandler, getHeader, readBody, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';

import { handleTelegramCallback } from './telegram-dispatch.service';
import {
  isTelegramWebhookSecretValid,
  telegramUpdateSchema,
} from './telegram-webhook.service';

export const telegramWebhookHandler = defineEventHandler(async (event) => {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const secret =
    getHeader(event, 'x-tg-secret') ||
    getHeader(event, 'x-telegram-bot-api-secret-token');
  if (!isTelegramWebhookSecretValid(configuredSecret, secret)) {
    setResponseStatus(event, configuredSecret ? 401 : 503);
    return { ok: false };
  }

  const body = await readBody(event).catch((error: unknown) => {
    logApiError('telegram-webhook-body', error, undefined, event);
  });
  const update = telegramUpdateSchema.safeParse(body);
  if (!update.success) {
    setResponseStatus(event, 400);
    return { ok: false };
  }
  if (update.data.callback_query) {
    void handleTelegramCallback(update.data.callback_query).catch(
      (error: unknown) =>
        logApiError('telegram-webhook-callback', error, undefined, event),
    );
  }
  return { ok: true };
});
