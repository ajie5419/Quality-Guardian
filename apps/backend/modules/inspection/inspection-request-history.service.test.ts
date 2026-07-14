import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestHistoryService } from './inspection-request-history.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
  },
}));

describe('inspectionRequestHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paged supplier request work orders with their latest submission', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ total: 2n }])
      .mockResolvedValueOnce([
        {
          workOrderNumber: 'WO-2',
          projectName: 'Project B',
          lastSubmittedAt: new Date('2026-06-02T00:00:00.000Z'),
        },
        {
          workOrderNumber: 'WO-1',
          projectName: 'Project A',
          lastSubmittedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);

    const result =
      await InspectionRequestHistoryService.getSupplierHistoryProjects({
        identitySource: 'supplier',
        page: 2,
        pageSize: 5,
        supplierId: 'supplier-1',
        teamIds: [],
      });

    expect(result).toEqual({
      items: [
        {
          workOrderNumber: 'WO-2',
          projectName: 'Project B',
          lastSubmittedAt: '2026-06-02T00:00:00.000Z',
        },
        {
          workOrderNumber: 'WO-1',
          projectName: 'Project A',
          lastSubmittedAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      total: 2,
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const querySql = vi
      .mocked(prisma.$queryRaw)
      .mock.calls.map(([query]) =>
        String((query as { sql?: string }).sql || ''),
      )
      .join('\n');
    expect(querySql).toContain('qms_inspection_requests');
    expect(querySql).toContain('qms_inspection_request_work_orders');
    expect(querySql).toContain('request_row.supplierId');
    expect(querySql).not.toContain('inspectionLinks');
  });

  it('returns no process history when the supplier has no TEAM mapping', async () => {
    await expect(
      InspectionRequestHistoryService.getSupplierHistoryProjects({
        identitySource: 'team',
        supplierId: 'supplier-1',
        teamIds: [],
      }),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('queries process history through mapped TEAM identities', async () => {
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          workOrderNumber: 'WO-3',
          projectName: null,
          lastSubmittedAt: null,
        },
      ]);

    const result =
      await InspectionRequestHistoryService.getSupplierHistoryProjects({
        identitySource: 'team',
        supplierId: 'supplier-1',
        teamIds: ['team-1', 'team-2'],
      });

    expect(result.total).toBe(1);
    expect(result.items[0]?.workOrderNumber).toBe('WO-3');
  });
});
