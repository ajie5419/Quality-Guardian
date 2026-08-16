import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { runSchedulerTick, syncCronJobDefinitions } from './cron-job.service';
import { clearCronJobRegistry, registerCronJob } from './scheduler-registry';

vi.mock('~/utils/prisma', () => ({
  default: {
    cron_jobs: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

const mockedPrisma = vi.mocked(prisma, true);

describe('scheduler cron-job.service', () => {
  beforeEach(() => {
    clearCronJobRegistry();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCronJobRegistry();
  });

  it('syncCronJobDefinitions creates rows for registered jobs', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 8 * * *',
      description: 'demo',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.findFirst.mockResolvedValue(null);

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobKey: 'demo.job' }),
      }),
    );
  });

  it('syncCronJobDefinitions updates existing row', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 9 * * *',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.findFirst.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ cronExpr: '0 9 * * *' }),
      }),
    );
  });

  it('tick runs due matching job and records ok', async () => {
    const handler = vi.fn(async () => undefined);
    registerCronJob({
      key: 'demo.tick',
      cronExpr: '* * * * *',
      handler,
    });

    const now = new Date('2026-08-16T10:30:00Z');
    mockedPrisma.cron_jobs.findMany.mockResolvedValue([
      {
        id: 'job-1',
        jobKey: 'demo.tick',
        cronExpr: '* * * * *',
        description: null,
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastStatus: null,
      },
    ] as any);
    mockedPrisma.cron_jobs.updateMany.mockResolvedValue({ count: 1 });

    const executed = await runSchedulerTick(now);

    expect(executed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.cron_jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({ lastStatus: 'ok' }),
      }),
    );
  });

  it('tick skips non-matching job', async () => {
    const handler = vi.fn(async () => undefined);
    registerCronJob({
      key: 'demo.skip',
      cronExpr: '0 8 * * *',
      handler,
    });

    const now = new Date('2026-08-16T10:30:00Z'); // not 08:00
    mockedPrisma.cron_jobs.findMany.mockResolvedValue([
      {
        id: 'job-1',
        jobKey: 'demo.skip',
        cronExpr: '0 8 * * *',
        description: null,
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastStatus: null,
      },
    ] as any);

    const executed = await runSchedulerTick(now);

    expect(executed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
    expect(mockedPrisma.cron_jobs.updateMany).not.toHaveBeenCalled();
  });

  it('tick skips already-run-this-minute job (CAS count 0)', async () => {
    const handler = vi.fn(async () => undefined);
    registerCronJob({
      key: 'demo.cas',
      cronExpr: '* * * * *',
      handler,
    });

    const now = new Date('2026-08-16T10:30:00Z');
    mockedPrisma.cron_jobs.findMany.mockResolvedValue([
      {
        id: 'job-1',
        jobKey: 'demo.cas',
        cronExpr: '* * * * *',
        description: null,
        enabled: true,
        lastRunAt: new Date('2026-08-16T10:29:30Z'),
        lastError: null,
        lastStatus: null,
      },
    ] as any);
    mockedPrisma.cron_jobs.updateMany.mockResolvedValue({ count: 0 });

    const executed = await runSchedulerTick(now);

    expect(executed).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it('tick records handler failure as error', async () => {
    const handler = vi.fn(async () => {
      throw new Error('boom');
    });
    registerCronJob({
      key: 'demo.fail',
      cronExpr: '* * * * *',
      handler,
    });

    const now = new Date('2026-08-16T10:30:00Z');
    mockedPrisma.cron_jobs.findMany.mockResolvedValue([
      {
        id: 'job-1',
        jobKey: 'demo.fail',
        cronExpr: '* * * * *',
        description: null,
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastStatus: null,
      },
    ] as any);
    mockedPrisma.cron_jobs.updateMany.mockResolvedValue({ count: 1 });

    const executed = await runSchedulerTick(now);

    expect(executed).toBe(1);
    expect(mockedPrisma.cron_jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          lastStatus: 'error',
          lastError: expect.stringContaining('boom'),
        }),
      }),
    );
  });
});
