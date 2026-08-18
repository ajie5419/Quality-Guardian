import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCronJobRegistry,
  getCronJob,
  registerCronJob,
} from '~/modules/scheduler';
import prisma from '~/utils/prisma';

import { runAuditLogCleanup } from './audit-log-cleanup';

vi.mock('~/utils/prisma', () => ({
  default: {
    audit_logs: { deleteMany: vi.fn(), findMany: vi.fn() },
    login_logs: { deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));

describe('audit log cleanup cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCronJobRegistry();
  });

  it('registers a daily cron job under system-log.audit-cleanup', () => {
    registerCronJob({
      key: 'system-log.audit-cleanup',
      cronExpr: '0 3 * * *',
      description: 'cleanup',
      handler: runAuditLogCleanup,
    });
    const job = getCronJob('system-log.audit-cleanup');
    expect(job).toBeDefined();
    expect(job?.cronExpr).toBe('0 3 * * *');
  });

  it('deletes old logs in batches and stops when batch is short', async () => {
    vi.mocked(prisma.audit_logs.findMany).mockResolvedValue([
      { id: 'a1' },
      { id: 'a2' },
    ] as never);
    vi.mocked(prisma.audit_logs.deleteMany).mockResolvedValue({
      count: 2,
    } as never);
    vi.mocked(prisma.login_logs.findMany).mockResolvedValue([] as never);

    await runAuditLogCleanup();

    expect(prisma.audit_logs.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a1', 'a2'] } },
    });
    expect(prisma.audit_logs.findMany).toHaveBeenCalledTimes(1); // short batch stops
    expect(prisma.login_logs.findMany).toHaveBeenCalledTimes(1); // empty stops
  });

  it('deletes nothing when no old logs exist', async () => {
    vi.mocked(prisma.audit_logs.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.login_logs.findMany).mockResolvedValue([] as never);

    await runAuditLogCleanup();

    expect(prisma.audit_logs.deleteMany).not.toHaveBeenCalled();
    expect(prisma.login_logs.deleteMany).not.toHaveBeenCalled();
  });
});
