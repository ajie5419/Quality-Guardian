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

  it('groups incoming supplier requests by canonical supplier ID', async () => {
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
        category: 'INCOMING',
        identitySource: 'supplier',
        supplierId: 'supplier-1',
        teamIds: [],
      });

    expect(prisma.qms_inspection_requests.groupBy).toHaveBeenCalledWith({
      by: ['workOrderNumber'],
      where: {
        isDeleted: false,
        OR: [
          {
            inspection: {
              is: { category: 'INCOMING', supplierId: 'supplier-1' },
            },
          },
          {
            inspectionLinks: {
              some: {
                inspection: {
                  is: { category: 'INCOMING', supplierId: 'supplier-1' },
                },
              },
            },
          },
        ],
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

  it('uses mapped TEAM IDs for process supplier requests', async () => {
    (prisma.qms_inspection_requests.groupBy as any).mockResolvedValue([]);

    await InspectionRequestHistoryService.getSupplierHistoryProjects({
      category: 'PROCESS',
      identitySource: 'team',
      supplierId: 'supplier-1',
      teamIds: ['team-1', 'team-2'],
    });

    expect(prisma.qms_inspection_requests.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          OR: [
            {
              inspection: {
                is: {
                  category: 'PROCESS',
                  teamId: { in: ['team-1', 'team-2'] },
                },
              },
            },
            {
              inspectionLinks: {
                some: {
                  inspection: {
                    is: {
                      category: 'PROCESS',
                      teamId: { in: ['team-1', 'team-2'] },
                    },
                  },
                },
              },
            },
          ],
        },
      }),
    );
  });
});
