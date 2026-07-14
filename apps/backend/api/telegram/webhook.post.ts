import type { CallbackQuery } from '~/modules/inspection/telegram-dispatch.service';

import process from 'node:process';

import { defineEventHandler, getHeader, readBody } from 'h3';
import { handleTelegramCallback } from '~/modules/inspection/telegram-dispatch.service';
import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('TelegramWebhook');

export default defineEventHandler(async (event) => {
  const secret =
    getHeader(event, 'x-tg-secret') ||
    getHeader(event, 'x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return { ok: false };

  const update = (await readBody(event)) as { callback_query?: CallbackQuery };
  if (update.callback_query) {
    void handleTelegramCallback(update.callback_query).catch((error: unknown) =>
      logger.error({ err: error }, 'callback handler error'),
    );
  }
  return { ok: true };
});
