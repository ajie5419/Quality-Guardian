import { registerCronJob } from '~/modules/scheduler';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('AuditLogCleanup');

const RETENTION_DAYS = 90;
const BATCH_SIZE = 5000;

/**
 * Daily 03:00 purge of audit/login logs older than RETENTION_DAYS
 * (data lifecycle P1: audit logs are retained 3 months).
 * Batched physical deletes keep lock time bounded; idempotent by design.
 */
export async function runAuditLogCleanup() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let deletedAudit = 0;
  let deletedLogin = 0;

  // audit_logs: batched delete (deleteMany has no take; batch by id list)
  for (;;) {
    const batch = await prisma.audit_logs.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    const result = await prisma.audit_logs.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    deletedAudit += result.count;
    if (batch.length < BATCH_SIZE) break;
  }

  // login_logs
  for (;;) {
    const batch = await prisma.login_logs.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;
    const result = await prisma.login_logs.deleteMany({
      where: { id: { in: batch.map((row) => row.id) } },
    });
    deletedLogin += result.count;
    if (batch.length < BATCH_SIZE) break;
  }

  logger.info(
    { deletedAudit, deletedLogin, cutoff: cutoff.toISOString() },
    'audit log cleanup done',
  );
}

export function registerAuditLogCleanup(): void {
  registerCronJob({
    key: 'system-log.audit-cleanup',
    cronExpr: '0 3 * * *',
    description: '每日 03:00 清理超过 90 天的审计/登录日志（数据生命周期 P1）',
    handler: runAuditLogCleanup,
  });
}
