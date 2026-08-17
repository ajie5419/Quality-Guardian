import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { ProcessMasterService } from './process-master.service';

vi.mock('~/utils/prisma', () => {
  const client = {
    dictionaries: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    inspection_request_process_options: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    processes: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return {
    default: {
      ...client,
      $transaction: vi.fn((callback) => callback(client)),
    },
  };
});

describe('process master service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active global options for other modules', async () => {
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      {
        id: 'process-1',
        inspectionRequestCategory: 'PROCESS',
        name: 'Welding',
        sort: 3,
        supplierSource: 'Supplier',
      },
    ] as never);

    await expect(ProcessMasterService.listActiveOptions()).resolves.toEqual([
      {
        id: 'process-1',
        inspectionRequestCategory: 'PROCESS',
        name: 'Welding',
        sort: 3,
        supplierSource: 'Supplier',
      },
    ]);
    expect(prisma.processes.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        inspectionRequestCategory: true,
        name: true,
        sort: true,
        supplierSource: true,
      },
    });
  });

  it('finds only an active process by canonical ID', async () => {
    vi.mocked(prisma.processes.findFirst).mockResolvedValue({
      id: 'process-1',
      name: 'Incoming inspection',
    } as never);

    await ProcessMasterService.findActiveById(' process-1 ');

    expect(prisma.processes.findFirst).toHaveBeenCalledWith({
      where: { id: 'process-1', isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
  });

  it('lists the same global process in both inspection categories', async () => {
    vi.mocked(prisma.processes.findMany).mockResolvedValue([
      {
        categories: [],
        code: 'WELD',
        id: 'process-1',
        inspectionRequestOptions: [
          { category: 'PROCESS' },
          { category: 'INCOMING' },
        ],
        name: 'Welding',
        sort: 1,
        status: 1,
      },
    ] as never);

    await expect(ProcessMasterService.listForManagement()).resolves.toEqual([
      {
        categories: ['PROCESS', 'INCOMING'],
        code: 'WELD',
        id: 'process-1',
        name: 'Welding',
        sort: 1,
        status: 1,
      },
    ]);
  });

  it('returns the configured supplier source for inspection request options', async () => {
    vi.mocked(
      prisma.inspection_request_process_options.findMany,
    ).mockResolvedValue([
      {
        category: 'INCOMING',
        process: {
          id: 'process-2',
          name: '机加成品件',
          supplierSource: 'Outsourcing',
        },
      },
    ] as never);

    await expect(
      ProcessMasterService.listInspectionRequestOptions('INCOMING'),
    ).resolves.toEqual([
      {
        category: 'INCOMING',
        processId: 'process-2',
        processName: '机加成品件',
        supplierSource: 'Outsourcing',
      },
    ]);
  });

  it('persists the supplier source when creating a process', async () => {
    vi.mocked(prisma.processes.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.processes.create).mockResolvedValue({
      code: null,
      id: 'process-3',
      name: '机加成品件',
      sort: 1,
      status: 1,
      supplierSource: 'Outsourcing',
    } as never);

    await ProcessMasterService.create({
      categories: ['INCOMING'],
      name: '机加成品件',
      sort: 1,
      supplierSource: 'Outsourcing',
    });

    expect(prisma.processes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierSource: 'Outsourcing',
        }),
      }),
    );
  });

  it('updates the supplier source independently of the process name', async () => {
    vi.mocked(prisma.processes.findFirst).mockResolvedValue({
      id: 'process-1',
    } as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: null,
      id: 'process-1',
      name: '机加完成品',
      sort: 1,
      status: 1,
      supplierSource: 'Outsourcing',
    } as never);

    await ProcessMasterService.update('process-1', {
      supplierSource: 'Outsourcing',
    });

    expect(prisma.processes.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierSource: 'Outsourcing',
        }),
      }),
    );
  });

  it('restores a deleted process with the original ID', async () => {
    vi.mocked(prisma.processes.findUnique).mockResolvedValue({
      id: 'process-1',
      isDeleted: true,
    } as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: null,
      id: 'process-1',
      name: 'Welding',
      sort: 4,
      status: 1,
    } as never);

    const result = await ProcessMasterService.create({
      categories: ['PROCESS'],
      name: 'Welding',
      sort: 4,
    });

    expect(result.id).toBe('process-1');
    expect(prisma.processes.create).not.toHaveBeenCalled();
    expect(
      prisma.inspection_request_process_options.upsert,
    ).toHaveBeenCalledTimes(2);
  });

  it('saves process and incoming selections independently', async () => {
    vi.mocked(prisma.processes.count).mockResolvedValue(2);

    await ProcessMasterService.replaceInspectionRequestSelections({
      incomingProcessIds: ['process-2'],
      processProcessIds: ['process-1'],
    });

    expect(
      prisma.inspection_request_process_options.updateMany,
    ).toHaveBeenNthCalledWith(1, {
      where: { category: 'PROCESS' },
      data: { isEnabled: false },
    });
    expect(
      prisma.inspection_request_process_options.updateMany,
    ).toHaveBeenNthCalledWith(2, {
      where: { category: 'INCOMING' },
      data: { isEnabled: false },
    });
    expect(
      prisma.inspection_request_process_options.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category_processId: {
            category: 'PROCESS',
            processId: 'process-1',
          },
        },
      }),
    );
    expect(
      prisma.inspection_request_process_options.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category_processId: {
            category: 'INCOMING',
            processId: 'process-2',
          },
        },
      }),
    );
  });

  it('rejects a process hidden for the requested category', async () => {
    vi.mocked(
      prisma.inspection_request_process_options.findFirst,
    ).mockResolvedValue(null);

    await expect(
      ProcessMasterService.assertInspectionRequestOption(
        'process-1',
        'PROCESS',
      ),
    ).rejects.toMatchObject({ code: 'INSPECTION_PROCESS_NOT_AVAILABLE' });
  });

  it('keeps inspection option ordering aligned when process sort changes', async () => {
    vi.mocked(prisma.processes.findFirst).mockResolvedValue({
      id: 'process-1',
    } as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: 'WELD',
      id: 'process-1',
      name: 'Welding',
      sort: 8,
      status: 1,
    } as never);

    await ProcessMasterService.update('process-1', { sort: 8 });

    expect(
      prisma.inspection_request_process_options.updateMany,
    ).toHaveBeenCalledWith({
      where: { processId: 'process-1' },
      data: { sort: 8 },
    });
  });

  it('does not rewrite inspection option ordering for unrelated updates', async () => {
    vi.mocked(prisma.processes.findFirst).mockResolvedValue({
      id: 'process-1',
    } as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: 'WELD',
      id: 'process-1',
      name: 'Welding',
      sort: 1,
      status: 0,
    } as never);

    await ProcessMasterService.update('process-1', { status: 0 });

    expect(
      prisma.inspection_request_process_options.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('keeps the incoming-type dictionary in sync when a process is renamed', async () => {
    vi.mocked(prisma.processes.findFirst)
      .mockResolvedValueOnce({
        id: 'process-1',
        name: '机加成品件',
      } as never)
      .mockResolvedValueOnce(null as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: null,
      id: 'process-1',
      name: '机加成品件-外协',
      sort: 1,
      status: 1,
      supplierSource: 'Outsourcing',
    } as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { id: 'dict-1' },
    ] as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue(null as never);

    await ProcessMasterService.update('process-1', {
      name: '机加成品件-外协',
    });

    expect(prisma.dictionaries.findMany).toHaveBeenCalledWith({
      where: {
        dictType: 'incoming_type',
        isDeleted: false,
        OR: [{ dictKey: '机加成品件' }, { dictValue: '机加成品件' }],
      },
      select: { id: true },
    });
    expect(prisma.dictionaries.findFirst).toHaveBeenCalledWith({
      where: {
        dictType: 'incoming_type',
        isDeleted: false,
        NOT: { id: { in: ['dict-1'] } },
        OR: [{ dictKey: '机加成品件-外协' }, { dictValue: '机加成品件-外协' }],
      },
      select: { id: true },
    });
    expect(prisma.dictionaries.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['dict-1'] } },
      data: { dictKey: '机加成品件-外协', dictValue: '机加成品件-外协' },
    });
  });

  it('does not rewrite the dictionary when the target name is already taken', async () => {
    vi.mocked(prisma.processes.findFirst)
      .mockResolvedValueOnce({
        id: 'process-1',
        name: '机加成品件',
      } as never)
      .mockResolvedValueOnce(null as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: null,
      id: 'process-1',
      name: '机加成品件-外协',
      sort: 1,
      status: 1,
      supplierSource: 'Outsourcing',
    } as never);
    vi.mocked(prisma.dictionaries.findMany).mockResolvedValue([
      { id: 'dict-1' },
    ] as never);
    vi.mocked(prisma.dictionaries.findFirst).mockResolvedValue({
      id: 'dict-2',
    } as never);

    await ProcessMasterService.update('process-1', {
      name: '机加成品件-外协',
    });

    expect(prisma.dictionaries.updateMany).not.toHaveBeenCalled();
  });

  it('does not touch the dictionary when the process name is unchanged', async () => {
    vi.mocked(prisma.processes.findFirst).mockResolvedValue({
      id: 'process-1',
      name: 'Welding',
    } as never);
    vi.mocked(prisma.processes.update).mockResolvedValue({
      code: null,
      id: 'process-1',
      name: 'Welding',
      sort: 1,
      status: 1,
      supplierSource: 'Supplier',
    } as never);

    await ProcessMasterService.update('process-1', { sort: 2 });

    expect(prisma.dictionaries.updateMany).not.toHaveBeenCalled();
  });
});
