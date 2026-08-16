import type { quality_records_status } from '@prisma/client';

import { registerCronJob } from '~/modules/scheduler';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { sendMessage } from '~/utils/telegram-bot';

const logger = createModuleLogger('NcOverdueReminder');

const OVERDUE_DAYS = 7;
const OPEN_STATUSES: quality_records_status[] = ['OPEN', 'IN_PROGRESS'];

/**
 * Daily 09:00 scan of non-conformance records (quality_records with a
 * nonConformanceNumber) still OPEN/IN_PROGRESS older than OVERDUE_DAYS.
 * Notifies the configured Telegram chat.
 */
async function runNcOverdue() {
  const cutoff = new Date(
    Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000,
  );

  const overdue = await prisma.quality_records.findMany({
    where: {
      isDeleted: false,
      nonConformanceNumber: { not: null },
      status: { in: OPEN_STATUSES },
      createdAt: { lt: cutoff },
    },
    select: {
      createdAt: true,
      id: true,
      nonConformanceNumber: true,
      responsibleDepartment: true,
      workOrderNumber: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (overdue.length === 0) {
    logger.info('nc overdue reminder: none overdue');
    return;
  }

  const lines = overdue
    .slice(0, 30)
    .map((record) => {
      const created = record.createdAt.toISOString().slice(0, 10);
      const dept = record.responsibleDepartment || '-';
      return `${record.nonConformanceNumber}（${record.workOrderNumber ?? '-'}）责任:${dept} 创建 ${created}`;
    });

  const summary = `【不合格项超时催办】\n超过 ${OVERDUE_DAYS} 天未关闭 ${overdue.length} 项：\n${lines.join('\n')}`;
  await sendMessage(summary.slice(0, 4000));
  logger.info({ count: overdue.length }, 'nc overdue reminder sent');
}

export function registerNcOverdueReminder(): void {
  registerCronJob({
    key: 'inspection.nc-overdue',
    cronExpr: '0 9 * * *',
    description: '每日 09:00 扫描超 7 天未关闭的不合格项并通知',
    handler: runNcOverdue,
  });
}
