import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  backfillInspectionRequestCategories,
  parseInspectionRequestCategoryBackfillOptions,
  resolveInspectionRequestCategory,
} from './inspection-request-category-backfill';

vi.mock('~/utils/prisma', () => ({
  default: {
    processes: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    qms_inspection_requests: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    unresolved_master_data_refs: {
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('~/utils/logger', () => ({
  createModuleLogger: () => ({ info: vi.fn() }),
}));

describe('inspection request category backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.processes.count).mockResolvedValue(0);
  });
  it('uses canonical identity IDs before legacy process text', () => {
    expect(
      resolveInspectionRequestCategory({
        id: 'request-1',
        processName: 'Renamed incoming process',
        supplierId: 'supplier-1',
        teamId: null,
      }),
    ).toEqual({ category: 'INCOMING', reason: null });
    expect(
      resolveInspectionRequestCategory({
        id: 'request-2',
        processName: 'Incoming inspection',
        supplierId: null,
        teamId: 'team-1',
      }),
    ).toEqual({ category: 'PROCESS', reason: null });
  });

  it('uses the historical incoming name only when both IDs are absent', () => {
    expect(
      resolveInspectionRequestCategory({
        id: 'request-1',
        processName: '进货检验',
        supplierId: null,
        teamId: null,
      }),
    ).toEqual({ category: 'INCOMING', reason: null });
  });

  it('classifies a supplier-linked TEAM request as process', () => {
    expect(
      resolveInspectionRequestCategory({
        id: 'request-1',
        processName: 'Any process',
        supplierId: 'supplier-1',
        teamId: 'team-1',
      }),
    ).toEqual({ category: 'PROCESS', reason: null });
  });

  it('parses bounded execution options', () => {
    expect(
      parseInspectionRequestCategoryBackfillOptions([
        '--apply',
        '--batch-size=500',
      ]),
    ).toEqual({ batchSize: 500, mode: 'apply' });
    expect(() =>
      parseInspectionRequestCategoryBackfillOptions(['--batch-size=0']),
    ).toThrow('--batch-size must be an integer between 1 and 1000');
  });

  it('performs no writes in dry-run mode', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          processName: 'Process inspection',
          supplierId: 'supplier-1',
          teamId: 'team-1',
        },
      ] as never)
      .mockResolvedValueOnce([]);

    await expect(
      backfillInspectionRequestCategories({ batchSize: 100, mode: 'dry-run' }),
    ).resolves.toEqual({
      mode: 'dry-run',
      processScanned: 0,
      processUpdated: 0,
      scanned: 1,
      updated: 0,
    });
    expect(prisma.processes.updateMany).not.toHaveBeenCalled();
    expect(prisma.qms_inspection_requests.updateMany).not.toHaveBeenCalled();
    expect(prisma.unresolved_master_data_refs.upsert).not.toHaveBeenCalled();
  });

  it('classifies the legacy incoming process in release maintenance', async () => {
    vi.mocked(prisma.processes.count).mockResolvedValue(1);
    vi.mocked(prisma.processes.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.qms_inspection_requests.findMany).mockResolvedValue([]);

    await expect(
      backfillInspectionRequestCategories({ batchSize: 100, mode: 'apply' }),
    ).resolves.toMatchObject({ processScanned: 1, processUpdated: 1 });
    expect(prisma.processes.updateMany).toHaveBeenCalledWith({
      data: { inspectionRequestCategory: 'INCOMING' },
      where: {
        inspectionRequestCategory: 'PROCESS',
        isDeleted: false,
        name: '进货检验',
      },
    });
  });

  it('is idempotent after an applied row no longer matches the null category query', async () => {
    vi.mocked(prisma.qms_inspection_requests.findMany)
      .mockResolvedValueOnce([
        {
          id: 'request-1',
          processName: 'Process inspection',
          supplierId: null,
          teamId: 'team-1',
        },
      ] as never)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(prisma.qms_inspection_requests.updateMany).mockResolvedValue({
      count: 1,
    });

    await expect(
      backfillInspectionRequestCategories({ batchSize: 100, mode: 'apply' }),
    ).resolves.toMatchObject({ scanned: 1, updated: 1 });
    await expect(
      backfillInspectionRequestCategories({ batchSize: 100, mode: 'apply' }),
    ).resolves.toMatchObject({ scanned: 0, updated: 0 });
    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.qms_inspection_requests.updateMany).toHaveBeenCalledWith({
      data: { category: 'PROCESS' },
      where: { category: null, id: 'request-1', isDeleted: false },
    });
  });
});
