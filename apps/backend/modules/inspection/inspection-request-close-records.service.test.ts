import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { createCloseInspectionRecords } from './inspection-request-close-records.service';
import { InspectionService } from './inspection.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('./inspection.service', () => ({
  InspectionService: {
    create: vi.fn(),
  },
}));

describe('createCloseInspectionRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one inspection record per selected work order', async () => {
    vi.mocked(prisma.work_orders.findMany).mockResolvedValue([
      { projectName: 'Project 1', workOrderNumber: 'WO-001' },
      { projectName: 'Project 2', workOrderNumber: 'WO-002' },
    ] as any);
    vi.mocked(InspectionService.create)
      .mockResolvedValueOnce({ id: 'inspection-1' } as any)
      .mockResolvedValueOnce({ id: 'inspection-2' } as any);

    const links = await createCloseInspectionRecords({
      body: {
        attachments: [
          { name: 'record.pdf', url: 'https://example.test/r.pdf' },
        ],
        result: 'PASS',
      },
      request: {
        attachments: [
          { name: 'self.pdf', url: 'https://example.test/self.pdf' },
        ],
        closeRemark: null,
        componentName: '',
        mutualCheckResult: 'PASS',
        partName: 'Bearing',
        process: { name: '进货检验' },
        processName: '进货检验',
        quantity: 1,
        reporter: 'Reporter',
        requestInfo: JSON.stringify({ incomingType: '外购件' }),
        selfCheckResult: 'PASS',
        team: 'Supplier',
        work_order: { projectName: 'Project 1' },
        workOrderNumber: 'WO-001',
        workOrders: [
          { isPrimary: true, workOrderNumber: 'WO-001' },
          { isPrimary: false, workOrderNumber: 'WO-002' },
        ],
      } as any,
    });

    expect(links).toEqual([
      {
        inspectionId: 'inspection-1',
        isPrimary: true,
        workOrderNumber: 'WO-001',
      },
      {
        inspectionId: 'inspection-2',
        isPrimary: false,
        workOrderNumber: 'WO-002',
      },
    ]);
    expect(InspectionService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hasSelfCheckDocuments: true,
        projectName: 'Project 1',
        selfCheckDocuments: JSON.stringify([
          {
            name: 'self.pdf',
            size: 0,
            type: '',
            url: 'https://example.test/self.pdf',
          },
        ]),
        workOrderNumber: 'WO-001',
      }),
    );
    expect(InspectionService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        projectName: 'Project 2',
        workOrderNumber: 'WO-002',
      }),
    );
  });
});
