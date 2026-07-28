import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import { ProcessMasterService } from './process-master.service';

vi.mock('~/utils/prisma', () => {
  const client = {
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
      { id: 'process-1', name: 'Welding', sort: 3 },
    ] as never);

    await expect(ProcessMasterService.listActiveOptions()).resolves.toEqual([
      { id: 'process-1', name: 'Welding', sort: 3 },
    ]);
    expect(prisma.processes.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, status: 1 },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sort: true },
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
});
