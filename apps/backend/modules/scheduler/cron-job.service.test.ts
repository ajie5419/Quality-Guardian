import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
      upsert: vi.fn(),
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

const SCHEMA_CANDIDATES = [
  resolve(process.cwd(), 'apps/backend/prisma/schema.prisma'),
  resolve(process.cwd(), 'prisma/schema.prisma'),
];

function readCronJobsSchemaBlock(): string {
  const schemaPath = SCHEMA_CANDIDATES.find((candidate) =>
    existsSync(candidate),
  );
  expect(schemaPath).toBeDefined();
  const schema = readFileSync(schemaPath!, 'utf8');
  const cronJobsBlock = schema.match(/model cron_jobs \{[\s\S]*?\n\}/);
  expect(cronJobsBlock).not.toBeNull();
  return cronJobsBlock![0];
}

describe('scheduler cron-job.service', () => {
  beforeEach(() => {
    clearCronJobRegistry();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearCronJobRegistry();
  });

  it('syncCronJobDefinitions upserts rows by unique jobKey', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 8 * * *',
      description: 'demo',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.upsert.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobKey: 'demo.job' },
        create: expect.objectContaining({ jobKey: 'demo.job' }),
        update: expect.objectContaining({ enabled: true }),
      }),
    );
  });

  it('syncCronJobDefinitions is idempotent across repeated syncs', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 8 * * *',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.upsert.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();
    await syncCronJobDefinitions();

    // Unique jobKey identity: every sync targets the same single row.
    expect(mockedPrisma.cron_jobs.upsert).toHaveBeenCalledTimes(2);
    for (const call of mockedPrisma.cron_jobs.upsert.mock.calls) {
      expect(call[0]).toMatchObject({ where: { jobKey: 'demo.job' } });
    }
    expect(mockedPrisma.cron_jobs.create).not.toHaveBeenCalled();
  });

  it('syncCronJobDefinitions updates cronExpr on the same row', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 9 * * *',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.upsert.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobKey: 'demo.job' },
        update: expect.objectContaining({ cronExpr: '0 9 * * *' }),
      }),
    );
  });

  it('syncCronJobDefinitions revives a soft-deleted row in place', async () => {
    registerCronJob({
      key: 'demo.job',
      cronExpr: '0 8 * * *',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.upsert.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();

    // The unique jobKey slot is reused: update re-enables and clears isDeleted
    // instead of creating a second definition row.
    expect(mockedPrisma.cron_jobs.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ enabled: true, isDeleted: false }),
      }),
    );
  });

  it('syncCronJobDefinitions skips invalid cron expressions', async () => {
    registerCronJob({
      key: 'demo.invalid',
      cronExpr: 'not a cron',
      handler: async () => undefined,
    });

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.upsert).not.toHaveBeenCalled();
    // Invalid code definitions must not leave an existing enabled DB row alive.
    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        isDeleted: false,
      },
      data: { enabled: false },
    });
  });

  it('syncCronJobDefinitions disables every active row when registry is empty', async () => {
    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        isDeleted: false,
      },
      data: { enabled: false },
    });
  });

  it('syncCronJobDefinitions disables rows removed from the registry', async () => {
    registerCronJob({
      key: 'demo.kept',
      cronExpr: '0 8 * * *',
      handler: async () => undefined,
    });
    mockedPrisma.cron_jobs.upsert.mockResolvedValue({ id: 'job-1' } as any);

    await syncCronJobDefinitions();

    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        isDeleted: false,
        jobKey: { notIn: ['demo.kept'] },
      },
      data: { enabled: false },
    });
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
    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job-1',
          enabled: true,
          isDeleted: false,
        }),
        data: expect.objectContaining({ lastRunAt: now }),
      }),
    );
    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { lastRunAt: { lt: new Date('2026-08-16T10:30:00Z') } },
          ]),
        }),
      }),
    );
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
    // Claim already wrote lastRunAt; handler failure must not roll it back so
    // the retry policy stays "next schedule" (at-most-once per minute).
    expect(mockedPrisma.cron_jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'job-1',
          enabled: true,
          isDeleted: false,
        }),
        data: expect.objectContaining({ lastRunAt: now }),
      }),
    );
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

  it('schema invariant: cron_jobs.jobKey stays globally unique', () => {
    // SCHEDULER-INTEGRITY-001: the unique jobKey identity makes the atomic
    // upsert safe under multi-instance startup. Regression guard: if @unique
    // is ever removed, the find-then-create race comes back.
    expect(readCronJobsSchemaBlock()).toMatch(/jobKey\s+String\s+@unique/);
  });

  it('schema invariant: no redundant (jobKey, isDeleted) composite index', () => {
    // The unique jobKey index covers every jobKey-prefixed lookup; the old
    // composite was dropped by the SCHEDULER-INTEGRITY-001 migration.
    expect(readCronJobsSchemaBlock()).not.toMatch(
      /@@index\(\[jobKey, isDeleted\]\)/,
    );
  });
});
