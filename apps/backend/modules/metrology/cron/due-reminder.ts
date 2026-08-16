import { registerCronJob } from '~/modules/scheduler';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { sendMessage } from '~/utils/telegram-bot';

const logger = createModuleLogger('MetrologyDueReminder');

const DUE_WINDOW_DAYS = 30;

/**
 * Daily 08:00 scan of measuring instruments whose validUntil falls within the
 * next 30 days (or already expired). Notifies the configured Telegram chat.
 */
async function runDueReminder() {
  const now = new Date();
  const horizon = new Date(now.getTime() + DUE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const dueInstruments = await prisma.measuring_instruments.findMany({
    where: {
      isDeleted: false,
      validUntil: { lte: horizon },
    },
    select: {
      instrumentCode: true,
      instrumentName: true,
      inspectionStatus: true,
      usingUnit: true,
      validUntil: true,
    },
    orderBy: { validUntil: 'asc' },
  });

  if (dueInstruments.length === 0) {
    logger.info('metrology due reminder: no instruments due');
    return;
  }

  const lines = dueInstruments
    .slice(0, 30)
    .map((instrument) => {
      const dueDate = instrument.validUntil
        ? instrument.validUntil.toISOString().slice(0, 10)
        : '?';
      const expired = instrument.validUntil && instrument.validUntil < now;
      const flag = expired ? '⚠️ 已过期' : '⏳ 即将到期';
      return `${flag} ${instrument.instrumentCode} ${instrument.instrumentName}（${instrument.usingUnit ?? '-'}）截止 ${dueDate}`;
    });

  const summary = `【计量器具检定提醒】\n${DUE_WINDOW_DAYS} 天内到期/已过期 ${dueInstruments.length} 件：\n${lines.join('\n')}`;
  await sendMessage(summary.slice(0, 4000));
  logger.info(
    { count: dueInstruments.length },
    'metrology due reminder sent',
  );
}

export function registerMetrologyDueReminder(): void {
  registerCronJob({
    key: 'metrology.due-reminder',
    cronExpr: '0 8 * * *',
    description: '每日 08:00 扫描计量器具 30 天内到期并通知',
    handler: runDueReminder,
  });
}
