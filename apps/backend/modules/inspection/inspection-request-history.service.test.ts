import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRequestHistoryService } from './inspection-request-history.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    qms_inspection_requests: {
      groupBy: vi.fn(),
    },
    work_orders: {
      findMany: vi.fn(),
    },
  },
}));

describe('inspectionRequestHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups supplier inspection requests by work order and returns project names', async () => {
    (prisma.qms_inspection_requests.groupBy as any).mockResolvedValue([
      {
        workOrderNumber: 'WO-2',
        _max: { submittedAt: new Date('2026-06-02T00:00:00.000Z') },
      },
      {
        workOrderNumber: 'WO-1',
        _max: { submittedAt: new Date('2026-06-01T00:00:00.000Z') },
      },
    ]);
    vi.mocked(prisma.work_orders.findMany).mockResolvedValue([
      { workOrderNumber: 'WO-1', projectName: 'Project A' },
      { workOrderNumber: 'WO-2', projectName: 'Project B' },
    ] as never);

    const result =
      await InspectionRequestHistoryService.getSupplierHistoryProjects({
        supplierName: 'Supplier A',
        supplierNameId: 'md-1',
      });

    expect(prisma.qms_inspection_requests.groupBy).toHaveBeenCalledWith({
      by: ['workOrderNumber'],
      where: {
        isDeleted: false,
        OR: [{ team: 'Supplier A' }, { teamId: 'md-1' }],
      },
      _max: { submittedAt: true },
      orderBy: { _max: { submittedAt: 'desc' } },
      take: 50,
    });
    expect(result).toEqual([
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
    ]);
  });
});
