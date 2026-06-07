import { Buffer } from 'node:buffer';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import { SupervisionPlanTaskImportService } from '~/modules/supervision/supervision-plan-task-import.service';
import { parseSheet, parseWorkbook } from '~/utils/excel-parser';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    supervision_plan_tasks: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    supervision_projects: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/file-storage/file-storage.service', () => ({
  FileStorageService: {
    getFileBufferByStoredName: vi.fn(),
  },
}));

vi.mock('~/utils/excel-parser', () => ({
  parseSheet: vi.fn(),
  parseWorkbook: vi.fn(),
}));

vi.mock('~/modules/supervision/supervision-plan-task-progress', () => ({
  syncSupervisionProjectProgress: vi.fn(),
}));

describe('supervisionPlanTaskImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects missing, unsupported, and missing uploaded plan files', async () => {
    await expect(
      SupervisionPlanTaskImportService.importPlanTasks(
        'project-1',
        {},
        vi.fn(),
      ),
    ).rejects.toThrow('计划文件不能为空');

    await expect(
      SupervisionPlanTaskImportService.importPlanTasks(
        'project-1',
        { fileUrl: '/uploads/plan.txt' },
        vi.fn(),
      ),
    ).rejects.toThrow('仅支持 .xls 或 .xlsx 计划文件');

    vi.mocked(FileStorageService.getFileBufferByStoredName).mockResolvedValue(
      null,
    );
    await expect(
      SupervisionPlanTaskImportService.importPlanTasks(
        'project-1',
        { fileUrl: '/uploads/abc-plan.xlsx' },
        vi.fn(),
      ),
    ).rejects.toThrow('未找到上传的计划文件');
  });

  it('rejects workbook without sheets or recognizable task rows', async () => {
    vi.mocked(FileStorageService.getFileBufferByStoredName).mockResolvedValue({
      buffer: Buffer.from('xlsx'),
    } as never);
    vi.mocked(parseWorkbook).mockResolvedValue({ SheetNames: [] } as never);

    await expect(
      SupervisionPlanTaskImportService.importPlanTasks(
        'project-1',
        { fileUrl: '/uploads/abc-plan.xlsx' },
        vi.fn(),
      ),
    ).rejects.toThrow('计划文件没有工作表');

    vi.mocked(parseWorkbook).mockResolvedValue({
      SheetNames: ['Sheet1'],
    } as never);
    vi.mocked(parseSheet).mockResolvedValue([{ ID: '', Task_Name: '' }]);

    await expect(
      SupervisionPlanTaskImportService.importPlanTasks(
        'project-1',
        { fileUrl: '/uploads/abc-plan.xlsx' },
        vi.fn(),
      ),
    ).rejects.toThrow('未识别到任务计划数据');
  });

  it('imports workbook tasks, attaches hierarchy, soft-deletes old tasks, and returns refreshed list', async () => {
    vi.mocked(FileStorageService.getFileBufferByStoredName).mockResolvedValue({
      buffer: Buffer.from('xlsx'),
    } as never);
    vi.mocked(parseWorkbook).mockResolvedValue({
      SheetNames: ['Sheet1'],
    } as never);
    vi.mocked(parseSheet).mockResolvedValue([
      {
        '% Complete': '20',
        Duration: '5 days',
        Finish: '2026-01-05',
        ID: '1',
        'Outline Level': '1',
        'Resource Names': 'Alice',
        Start: '2026-01-01',
        Task_Name: 'Parent',
      },
      {
        '% Complete': '50',
        Duration: '2 days',
        Finish: '2026-01-03',
        ID: '1.1',
        'Outline Level': '2',
        Predecessors: '1',
        'Resource Names': 'Bob',
        Start: '2026-01-02',
        Task_Name: 'Child',
      },
    ]);
    const tx = {
      supervision_plan_tasks: {
        updateMany: vi.fn(),
        create: vi
          .fn()
          .mockResolvedValueOnce({ id: 'parent-id' })
          .mockResolvedValueOnce({ id: 'child-id' }),
      },
      supervision_projects: {
        update: vi.fn(),
      },
    };
    vi.mocked(prisma.$transaction).mockImplementation((cb: any) => cb(tx));
    const listPlanTasks = vi.fn().mockResolvedValue({
      items: [{ id: 'parent-id' }, { id: 'child-id' }],
      summary: { total: 2 },
      tree: [],
    });

    const result = await SupervisionPlanTaskImportService.importPlanTasks(
      'project-1',
      {
        fileName: 'Original.xlsx',
        fileUrl: '/uploads/abc-plan.xlsx',
      },
      listPlanTasks,
    );

    expect(result.items).toHaveLength(2);
    expect(FileStorageService.getFileBufferByStoredName).toHaveBeenCalledWith(
      'plan.xlsx',
    );
    expect(tx.supervision_plan_tasks.updateMany).toHaveBeenCalledWith({
      data: { isDeleted: true },
      where: { projectId: 'project-1' },
    });
    expect(tx.supervision_plan_tasks.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        isSummary: true,
        outlineLevel: 1,
        parentId: null,
        projectId: 'project-1',
        sourceFileName: 'Original.xlsx',
        status: expect.any(String),
        taskName: 'Parent',
        taskNo: '1',
      }),
    });
    expect(tx.supervision_plan_tasks.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        isSummary: false,
        outlineLevel: 2,
        parentId: 'parent-id',
        predecessorText: '1',
        progressPercent: 50,
        resourceName: 'Bob',
        taskName: 'Child',
        taskNo: '1.1',
      }),
    });
    expect(tx.supervision_projects.update).toHaveBeenCalledWith({
      data: { status: 'IN_PROGRESS' },
      where: { id: 'project-1' },
    });
    expect(listPlanTasks).toHaveBeenCalledWith('project-1');
  });
});
