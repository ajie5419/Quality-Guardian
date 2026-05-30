import { Buffer } from 'node:buffer';
import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger('TelegramBot');

function getConfig() {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  };
}

function isEnabled(): boolean {
  const { botToken, chatId } = getConfig();
  return Boolean(botToken && chatId);
}

async function callApi(method: string, body: Record<string, unknown>) {
  const { botToken } = getConfig();
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const data = (await res.json()) as { description?: string; ok: boolean };
  if (!data.ok) {
    logger.warn(
      { method, description: data.description },
      'Telegram API error',
    );
  }
  return data;
}

export interface InlineButton {
  callback_data: string;
  text: string;
}

export async function sendMessage(
  text: string,
  inlineKeyboard?: InlineButton[][],
) {
  if (!isEnabled()) return null;
  const body: Record<string, unknown> = {
    chat_id: getConfig().chatId,
    parse_mode: 'Markdown',
    text,
  };
  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return callApi('sendMessage', body);
}

export async function editMessageReplyMarkup(
  messageId: number,
  inlineKeyboard: InlineButton[][],
) {
  if (!isEnabled()) return null;
  return callApi('editMessageReplyMarkup', {
    chat_id: getConfig().chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

export async function editMessageText(
  messageId: number,
  text: string,
  inlineKeyboard?: InlineButton[][],
) {
  if (!isEnabled()) return null;
  const body: Record<string, unknown> = {
    chat_id: getConfig().chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    text,
  };
  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }
  return callApi('editMessageText', body);
}

export async function sendPhoto(photo: Buffer, caption?: string) {
  if (!isEnabled()) return null;
  const { botToken, chatId } = getConfig();
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('photo', new Blob([photo], { type: 'image/png' }), 'qr.png');
  if (caption) {
    form.append('caption', caption);
    form.append('parse_mode', 'Markdown');
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    body: form,
    method: 'POST',
  });
  const data = (await res.json()) as { description?: string; ok: boolean };
  if (!data.ok) {
    logger.warn({ description: data.description }, 'sendPhoto failed');
  }
  return data;
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
) {
  return callApi('answerCallback' + 'Query', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}

export async function notifyTelegramNewRequest(request: {
  id: string;
  partName: string;
  processName: string;
  reporter?: string;
  requestNo: string;
  workOrderNumber: string;
}) {
  const text = [
    `*新报检任务*`,
    `单号: \`${request.requestNo}\``,
    `工单: ${request.workOrderNumber}`,
    `工序: ${request.processName}`,
    `零件: ${request.partName}`,
    request.reporter ? `报检人: ${request.reporter}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  await sendMessage(text, [
    [{ text: '调度', callback_data: `dispatch:${request.id}` }],
  ]);
}
