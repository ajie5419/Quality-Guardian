import process from 'node:process';

import { SystemService } from '~/modules/system';
import { UserService } from '~/modules/user';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import {
  answerCallbackQuery,
  editMessageText,
  sendMessage,
  sendPhoto,
} from '~/utils/telegram-bot';
import { generateCloseQrImage } from '~/utils/telegram-qr';

import { InspectionRequestDispatchService } from './inspection-request-dispatch.service';

const logger = createModuleLogger('TelegramDispatch');

interface Inspector {
  id: string;
  realName: null | string;
  username: string;
}

export interface TelegramInlineButton {
  callback_data: string;
  text: string;
}

/**
 * Resolves the system user that acts as the Telegram dispatcher.
 * Configured via TELEGRAM_DISPATCHER_USERNAME env var.
 * Returns null and logs a warning if unconfigured or no active user found.
 */
export async function resolveTelegramDispatcherIdentity() {
  const username = process.env.TELEGRAM_DISPATCHER_USERNAME;
  if (!username) {
    logger.warn(
      'TELEGRAM_DISPATCHER_USERNAME is not set; cannot dispatch via Telegram',
    );
    return null;
  }

  const user = await prisma.users.findFirst({
    select: { id: true, realName: true, username: true },
    where: { isDeleted: false, username },
  });

  if (!user) {
    logger.warn(
      { username },
      'Telegram dispatcher username not found or deleted; ignoring dispatch action',
    );
    return null;
  }

  return {
    id: user.id,
    realName: user.realName || user.username,
    roles: [] as string[],
    username: user.username,
  };
}

/**
 * Builds the Telegram inline keyboard buttons for inspector selection,
 * annotating each inspector with their current active task count.
 */
export async function buildInspectorMenuButtons(
  inspectors: Inspector[],
  requestId: string,
): Promise<TelegramInlineButton[][]> {
  const busyCounts = await Promise.all(
    inspectors.map((i) =>
      prisma.qms_inspection_requests.count({
        where: {
          inspectorId: i.id,
          isDeleted: false,
          status: { in: ['DISPATCHED', 'INSPECTING'] },
        },
      }),
    ),
  );

  const flat = inspectors.map((inspector, idx) => {
    const name = inspector.realName || inspector.username;
    const busy = busyCounts[idx] || 0;
    return {
      callback_data: `dispatch:${requestId}:${inspector.id}`,
      text: busy > 0 ? `${name} (忙碌-${busy}单)` : `${name} (空闲)`,
    };
  });

  const rows: TelegramInlineButton[][] = [];
  for (let i = 0; i < flat.length; i += 2) rows.push(flat.slice(i, i + 2));
  return rows;
}

/**
 * Dispatches an inspection request via Telegram with a resolved real user identity.
 * If the dispatcher cannot be resolved, logs a warning and throws FORBIDDEN.
 * The downstream business action is NOT performed for unknown senders.
 */
export async function dispatchInspectionRequestViaTelegram(
  requestId: string,
  inspectorId: string,
) {
  const actor = await resolveTelegramDispatcherIdentity();
  if (!actor) {
    logger.warn(
      { inspectorId, requestId },
      'Telegram dispatch skipped: no valid dispatcher identity',
    );
    throw new BusinessError(
      'FORBIDDEN',
      'Telegram dispatcher identity could not be resolved',
      403,
    );
  }

  return InspectionRequestDispatchService.dispatchRequest(
    null,
    requestId,
    { inspectorId, priority: 3 },
    actor,
  );
}

export interface CallbackQuery {
  data?: string;
  id: string;
  message?: { message_id?: number };
}

/**
 * Routes a Telegram callback_query to the appropriate handler:
 * - "dispatch:<id>" → shows inspector selection menu
 * - "dispatch:<id>:<inspectorId>" → performs dispatch and sends QR photo
 */
export async function handleTelegramCallback({
  data = '',
  id: queryId,
  message,
}: CallbackQuery): Promise<void> {
  const msgId = message?.message_id;

  if (data.startsWith('dispatch:') && !data.includes(':', 9)) {
    // Menu path: show inspector selection
    const requestId = data.slice('dispatch:'.length);
    void answerCallbackQuery(queryId);
    const keyboard = await buildInspectorMenuButtons(
      await UserService.findInspectors(),
      requestId,
    );
    await (msgId
      ? editMessageText(msgId, '选择检验员:', keyboard)
      : sendMessage('选择检验员:', keyboard));
  } else if (data.startsWith('dispatch:') && data.split(':').length === 3) {
    // Dispatch path: assign inspector
    const [, requestId = '', inspectorId = ''] = data.split(':');
    try {
      const r = await dispatchInspectionRequestViaTelegram(
        requestId,
        inspectorId,
      );
      const name = r.inspectorName || inspectorId;
      await answerCallbackQuery(queryId, `已派单给 ${name}`);
      if (msgId)
        await editMessageText(
          msgId,
          `✅ 已派单给 *${name}*\n单号: \`${r.requestNo}\``,
        );
      const base =
        (await SystemService.getSettingValue('qms:qrcode:base_url')) ||
        process.env.QR_BASE_URL ||
        'http://8.141.123.254';
      await sendPhoto(
        await generateCloseQrImage(requestId, name, base),
        `检验员: ${name}\n单号: ${r.requestNo}`,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '未知错误';
      await answerCallbackQuery(queryId, `派单失败: ${msg}`);
      logger.error(
        { err: error, inspectorId, requestId },
        'dispatch via telegram failed',
      );
    }
  }
}
