import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkOrderRequirementService } from '~/modules/work-order-requirement/work-order-requirement.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    work_order_requirements: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage', () => ({
  FileStorageService: {
    registerReferencesFromAttachments: vi.fn(),
    softDeleteReferences: vi.fn(),
  },
}));

vi.mock('~/modules/work-order/work-order.service', () => ({
  buildWorkOrderWhereCondition: vi.fn(async (params) => ({
    workOrderNumber: { contains: params.keyword || '' },
  })),
}));

vi.mock('~/utils/process-resolver', () => ({
  resolveCanonicalProcessName: vi.fn(
    ({ process, processName }) => process?.name || processName || null,
  ),
}));

describe('workOrderRequirementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$transaction).mockImplementation(async (input: any) => {
      if (typeof input === 'function') return input(prisma);
      return Promise.all(input);
    });
  });

  it('registers attachment references through file-storage module', async () => {
    const { FileStorageService } = await import('~/modules/file-storage');

    await WorkOrderRequirementService.registerAttachmentReferences({
      attachments: '["/a.pdf"]',
      bizId: 'req-1',
    });

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: '["/a.pdf"]',
      bizId: 'req-1',
      bizType: 'work_order_requirement',
    });
  });

  it('passes transaction clients through to attachment references', async () => {
    const { FileStorageService } = await import('~/modules/file-storage');
    const tx = {} as any;

    await WorkOrderRequirementService.registerAttachmentReferences({
      attachments: '["/a.pdf"]',
      bizId: 'req-1',
      tx,
    });

    expect(
      FileStorageService.registerReferencesFromAttachments,
    ).toHaveBeenCalledWith({
      attachments: '["/a.pdf"]',
      bizId: 'req-1',
      bizType: 'work_order_requirement',
      tx,
    });
  });

  it('creates multiple requirements inside transaction with selected fields', async () => {
    vi.mocked(prisma.work_order_requirements.create)
      .mockResolvedValueOnce({
        id: 'req-1',
        requirementName: 'A',
        workOrderNumber: 'WO-1',
      } as never)
      .mockResolvedValueOnce({
        id: 'req-2',
        requirementName: 'B',
        workOrderNumber: 'WO-1',
      } as never);

    const result = await WorkOrderRequirementService.createMany([
      { id: 'req-1', requirementName: 'A', workOrderNumber: 'WO-1' } as any,
      { id: 'req-2', requirementName: 'B', workOrderNumber: 'WO-1' } as any,
    ]);

    expect(result).toHaveLength(2);
    expect(prisma.work_order_requirements.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'req-1' }),
      select: { id: true, requirementName: true, workOrderNumber: true },
    });
  });

  it('updates an active requirement with atomic scope and status guards', async () => {
    vi.mocked(prisma.work_order_requirements.updateMany).mockResolvedValue({
      count: 1,
    });
    vi.mocked(prisma.work_order_requirements.findFirst).mockResolvedValue({
      confirmStatus: 'CONFIRMED',
      id: 'req-1',
    } as never);

    const result = await WorkOrderRequirementService.updateActiveById({
      data: { confirmStatus: 'CONFIRMED' },
      expectedConfirmStatus: 'PENDING',
      id: 'req-1',
      workOrderWhere: { division: 'Division A' },
    });

    expect(result).toEqual(expect.objectContaining({ id: 'req-1' }));
    expect(prisma.work_order_requirements.updateMany).toHaveBeenCalledWith({
      where: {
        confirmStatus: 'PENDING',
        id: 'req-1',
        isDeleted: false,
        status: 'active',
        work_order: { division: 'Division A' },
      },
      data: { confirmStatus: 'CONFIRMED' },
    });
  });

  it('does not read back a requirement when the atomic update loses a race', async () => {
    vi.mocked(prisma.work_order_requirements.updateMany).mockResolvedValue({
      count: 0,
    });

    const result = await WorkOrderRequirementService.updateActiveById({
      data: { confirmStatus: 'CONFIRMED' },
      expectedConfirmStatus: 'PENDING',
      id: 'req-1',
      workOrderWhere: {},
    });

    expect(result).toBeNull();
    expect(prisma.work_order_requirements.findFirst).not.toHaveBeenCalled();
  });

  it('soft deletes requirement data and attachment references', async () => {
    const { FileStorageService } = await import('~/modules/file-storage');
    vi.mocked(prisma.work_order_requirements.updateMany).mockResolvedValue({
      count: 1,
    });

    await WorkOrderRequirementService.softDeleteById({
      id: 'req-1',
      updatedBy: 'admin',
      workOrderWhere: { division: 'Division A' },
    });
    await WorkOrderRequirementService.softDeleteAttachmentReferences('req-1');

    expect(prisma.work_order_requirements.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'req-1',
        isDeleted: false,
        status: 'active',
        work_order: { division: 'Division A' },
      },
      data: { isDeleted: true, status: 'deleted', updatedBy: 'admin' },
    });
    expect(FileStorageService.softDeleteReferences).toHaveBeenCalledWith({
      bizId: 'req-1',
      bizType: 'work_order_requirement',
    });
  });

  it('finds active requirements for work order with canonical process relation', async () => {
    await WorkOrderRequirementService.findActiveByWorkOrder('WO-1');

    expect(prisma.work_order_requirements.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, status: 'active', workOrderNumber: 'WO-1' },
      orderBy: [{ updatedAt: 'desc' }],
      select: expect.objectContaining({
        process: { select: { name: true } },
        requirementName: true,
        responsibleTeamId: true,
      }),
    });
  });

  it('lists active process identities scoped to the selected work order', async () => {
    vi.mocked(prisma.work_order_requirements.findMany).mockResolvedValue([
      { process: { id: 'process-1', name: 'Welding' } },
      { process: null },
    ] as never);

    await expect(
      WorkOrderRequirementService.findActiveInspectionProcessIdentities('WO-1'),
    ).resolves.toEqual([{ processId: 'process-1', processName: 'Welding' }]);
    expect(prisma.work_order_requirements.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        processId: { not: null },
        status: 'active',
        workOrderNumber: 'WO-1',
        process: {
          is: {
            inspectionRequestCategory: 'PROCESS',
            isDeleted: false,
            status: 1,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        process: { select: { id: true, name: true } },
      },
    });
  });

  it('finds active aggregate requirements with reduced select fields', async () => {
    await WorkOrderRequirementService.findActiveForAggregate('WO-1');

    expect(prisma.work_order_requirements.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, status: 'active', workOrderNumber: 'WO-1' },
      select: expect.objectContaining({
        process: { select: { name: true } },
        responsibleTeam: true,
        responsibleTeamId: true,
      }),
    });
  });

  it('returns empty summary when work order numbers normalize to nothing', async () => {
    const result =
      await WorkOrderRequirementService.getSummaryByWorkOrderNumbers([' ', '']);

    expect(result).toEqual(new Map());
    expect(prisma.work_order_requirements.findMany).not.toHaveBeenCalled();
  });

  it('summarizes requirements by unique trimmed work order numbers', async () => {
    vi.mocked(prisma.work_order_requirements.findMany).mockResolvedValue([
      {
        confirmStatus: 'CONFIRMED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        workOrderNumber: 'WO-1',
      },
      {
        confirmStatus: 'PENDING',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        workOrderNumber: 'WO-1',
      },
    ] as never);

    const result =
      await WorkOrderRequirementService.getSummaryByWorkOrderNumbers([
        ' WO-1 ',
        'WO-1',
      ]);

    expect(result.get('WO-1')).toEqual(
      expect.objectContaining({
        confirmedRequirements: 1,
        overdueUnconfirmedRequirements: 1,
        plannedRequirements: 2,
      }),
    );
    expect(prisma.work_order_requirements.findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        status: 'active',
        workOrderNumber: { in: ['WO-1'] },
      },
      select: {
        confirmStatus: true,
        createdAt: true,
        workOrderNumber: true,
      },
    });
  });

  it('builds requirement overview counts with overdue threshold', async () => {
    vi.mocked(prisma.work_order_requirements.count)
      .mockResolvedValueOnce(5 as never)
      .mockResolvedValueOnce(2 as never)
      .mockResolvedValueOnce(1 as never);

    const result = await WorkOrderRequirementService.getRequirementOverview({
      keyword: 'WO',
    } as any);

    expect(result).toEqual({
      confirmedRequirements: 2,
      overdueUnconfirmedRequirements: 1,
      pendingRequirements: 3,
      plannedRequirements: 5,
    });
    expect(prisma.work_order_requirements.count).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          status: 'active',
          work_order: { workOrderNumber: { contains: 'WO' } },
        }),
      }),
    );
    expect(prisma.work_order_requirements.count).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { confirmStatus: 'CONFIRMED' },
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
  });

  it('builds requirement board with cross-module work order filter and process name normalization', async () => {
    vi.mocked(prisma.work_order_requirements.findMany).mockResolvedValue([
      {
        attachment: null,
        confirmer: null,
        confirmedAt: null,
        confirmStatus: 'PENDING',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        id: 'req-1',
        partName: 'Part',
        process: { name: 'Canonical Process' },
        processName: 'Stored Process',
        requirementName: 'Requirement',
        responsiblePerson: 'Owner',
        responsibleTeam: 'Team',
        workOrderNumber: 'WO-1',
        work_order: {
          customerName: 'Customer',
          division: 'Division',
          projectName: 'Project',
          status: 'ACTIVE',
        },
      },
    ] as never);
    vi.mocked(prisma.work_order_requirements.count).mockResolvedValue(
      1 as never,
    );

    const result = await WorkOrderRequirementService.getRequirementBoard({
      filter: 'pending',
      keyword: 'WO',
      page: 2,
      pageSize: 10,
    } as any);

    expect(result.items[0]?.processName).toBe('Canonical Process');
    expect(result.total).toBe(1);
    expect(prisma.work_order_requirements.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          isDeleted: false,
          NOT: { confirmStatus: 'CONFIRMED' },
          status: 'active',
          work_order: { workOrderNumber: { contains: 'WO' } },
        }),
      }),
    );
  });
});
