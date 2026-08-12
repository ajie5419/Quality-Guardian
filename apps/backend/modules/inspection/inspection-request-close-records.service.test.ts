import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { InspectionRecordCreateService } from './inspection-record-create.service';
import { createCloseInspectionRecords } from './inspection-request-close-records.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_orders: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('./inspection-record-create.service', () => ({
  InspectionRecordCreateService: {
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
    vi.mocked(InspectionRecordCreateService.create)
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
    expect(InspectionRecordCreateService.create).toHaveBeenNthCalledWith(
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
      undefined,
    );
    expect(InspectionRecordCreateService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        projectName: 'Project 2',
        workOrderNumber: 'WO-002',
      }),
      undefined,
    );
  });

  it('uses the provided transaction client for lookups and record creation', async () => {
    const tx = {
      work_orders: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { projectName: 'Project 1', workOrderNumber: 'WO-001' },
          ]),
      },
    } as any;
    vi.mocked(InspectionRecordCreateService.create).mockResolvedValueOnce({
      id: 'inspection-1',
    } as any);

    const links = await createCloseInspectionRecords({
      body: {
        attachments: [
          { name: 'record.pdf', url: 'https://example.test/r.pdf' },
        ],
        result: 'PASS',
      },
      request: {
        attachments: [],
        closeRemark: null,
        componentName: '',
        mutualCheckResult: 'PASS',
        partName: 'Bearing',
        process: { name: 'Welding' },
        processName: 'Welding',
        quantity: 1,
        reporter: 'Reporter',
        requestInfo: null,
        selfCheckResult: 'PASS',
        team: 'Team A',
        work_order: { projectName: 'Project 1' },
        workOrderNumber: 'WO-001',
        workOrders: [{ isPrimary: true, workOrderNumber: 'WO-001' }],
      } as any,
      tx,
    });

    expect(tx.work_orders.findMany).toHaveBeenCalled();
    expect(prisma.work_orders.findMany).not.toHaveBeenCalled();
    expect(InspectionRecordCreateService.create).toHaveBeenCalledWith(
      expect.anything(),
      tx,
    );
    expect(links).toEqual([
      {
        inspectionId: 'inspection-1',
        isPrimary: true,
        workOrderNumber: 'WO-001',
      },
    ]);
  });

  it('passes a direct internal department to generated records without TEAM', async () => {
    vi.mocked(prisma.work_orders.findMany).mockResolvedValue([
      { projectName: 'Project 1', workOrderNumber: 'WO-001' },
    ] as any);
    vi.mocked(InspectionRecordCreateService.create).mockResolvedValueOnce({
      id: 'inspection-1',
    } as any);

    await createCloseInspectionRecords({
      body: { result: 'PASS' },
      request: {
        category: 'PROCESS',
        componentName: 'Component',
        mutualCheckResult: 'PASS',
        partName: 'Bearing',
        process: { name: 'Machining' },
        processName: 'Machining',
        reporter: 'Reporter',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Machining BU',
        responsibleDepartmentId: 'dept-machining',
        selfCheckResult: 'PASS',
        supplierId: null,
        supplierName: null,
        team: null,
        teamId: null,
        workOrderNumber: 'WO-001',
        workOrders: [],
      } as any,
    });

    expect(InspectionRecordCreateService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'PROCESS',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Machining BU',
        responsibleDepartmentId: 'dept-machining',
        supplierId: '',
        teamId: '',
      }),
      undefined,
    );
  });
});
