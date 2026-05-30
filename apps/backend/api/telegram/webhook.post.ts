import process from 'node:process';

import { defineEventHandler, getHeader, readBody } from 'h3';
import { InspectionRequestDispatchService } from '~/modules/inspection/inspection-request-dispatch.service';
import { UserService } from '~/modules/user';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  sendPhoto,
} from '~/utils/telegram-bot';
import { generateCloseQrImage } from '~/utils/telegram-qr';

const logger = createModuleLogger('TelegramWebhook');

interface CallbackQuery {
  data?: string;
  id: string;
  message?: { chat?: { id: number }; message_id?: number };
}

interface TelegramUpdate {
  callback_query?: CallbackQuery;
}

export default defineEventHandler(async (event) => {
  const secret =
    getHeader(event, 'x-tg-secret') ||
    getHeader(event, 'x-telegram-bot-api-secret-token');
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return { ok: false };
  }

  const update = (await readBody(event)) as TelegramUpdate;
  if (update.callback_query) {
    void handleCallback(update.callback_query).catch((error) =>
      logger.error({ err: error }, 'callback handler error'),
    );
  }

  return { ok: true };
});

async function handleCallback(query: CallbackQuery) {
  const data = query.data || '';
  const messageId = query.message?.message_id;

  if (data.startsWith('dispatch:') && !data.includes(':', 9)) {
    await handleShowInspectors(data, messageId, query.id);
  } else if (data.startsWith('dispatch:') && data.split(':').length === 3) {
    await handleDispatch(data, messageId, query.id);
  }
}

async function handleShowInspectors(
  data: string,
  messageId: number | undefined,
  queryId: string,
) {
  void answerCallbackQuery(queryId);
  const requestId = data.replace('dispatch:', '');

  const inspectors = await UserService.findInspectors();
  const busyCounts = await Promise.all(
    inspectors.map((i) =>
      prisma.qms_inspection_requests.count({
        where: {
          inspectorId: i.id,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
          isDeleted: false,
        },
      }),
    ),
  );

  const buttons = inspectors.map((inspector, idx) => {
    const name = inspector.realName || inspector.username;
    const busy = busyCounts[idx] || 0;
    const label = busy > 0 ? `${name} (忙碌-${busy}单)` : `${name} (空闲)`;
    return {
      callback_data: `dispatch:${requestId}:${inspector.id}`,
      text: label,
    };
  });

  const keyboard = [];
  for (let i = 0; i < buttons.length; i += 2) {
    keyboard.push(buttons.slice(i, i + 2));
  }

  await (messageId
    ? editMessageText(messageId, '选择检验员:', keyboard)
    : sendMessage('选择检验员:', keyboard));
}

async function handleDispatch(
  data: string,
  messageId: number | undefined,
  queryId: string,
) {
  const parts = data.split(':');
  const requestId = parts[1] ?? '';
  const inspectorId = parts[2] ?? '';

  try {
    const result = await InspectionRequestDispatchService.dispatchRequest(
      {} as any,
      requestId,
      { inspectorId, priority: 3 },
      { id: 'telegram-bot', roles: ['admin'] } as any,
    );

    const inspectorName = result.inspectorName || inspectorId;
    await answerCallbackQuery(queryId, `已派单给 ${inspectorName}`);

    if (messageId) {
      await editMessageText(
        messageId,
        `✅ 已派单给 *${inspectorName}*\n单号: \`${result.requestNo}\``,
      );
    }

    const qrImage = await generateCloseQrImage(requestId, inspectorName);
    await sendPhoto(
      qrImage,
      `检验员: ${inspectorName}\n单号: ${result.requestNo}`,
    );
  } catch (error: any) {
    await answerCallbackQuery(
      queryId,
      `派单失败: ${error.message || '未知错误'}`,
    );
    logger.error(
      { err: error, requestId, inspectorId },
      'dispatch via telegram failed',
    );
  }
}
