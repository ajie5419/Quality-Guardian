import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionArchiveTaskService } from '~/modules/inspection/inspection-archive-task.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    inspection_archive_tasks: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/utils/prisma-error', () => ({
  isPrismaSchemaMismatchError: vi.fn().mockReturnValue(false),
}));

describe('inspectionArchiveTaskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getArchiveTasks', () => {
    it('should return paginated archive tasks', async () => {
      const items = [
        { id: 'at-1', status: 'PENDING', dueAt: new Date('2099-01-01') },
      ];
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue(
        items,
      );
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(1);

      const result = await InspectionArchiveTaskService.getArchiveTasks({
        page: 1,
        pageSize: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].isOverdue).toBe(false);
    });

    it('should mark items as overdue when dueAt is in the past', async () => {
      const pastDate = new Date('2020-01-01');
      const items = [{ id: 'at-1', status: 'PENDING', dueAt: pastDate }];
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue(
        items,
      );
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(1);

      const result = await InspectionArchiveTaskService.getArchiveTasks({});

      expect(result.items[0].isOverdue).toBe(true);
    });

    it('should not mark ARCHIVED items as overdue', async () => {
      const pastDate = new Date('2020-01-01');
      const items = [{ id: 'at-1', status: 'ARCHIVED', dueAt: pastDate }];
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue(
        items,
      );
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(1);

      const result = await InspectionArchiveTaskService.getArchiveTasks({});

      expect(result.items[0].isOverdue).toBe(false);
    });

    it('should filter by inspector when provided', async () => {
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue([]);
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(0);

      await InspectionArchiveTaskService.getArchiveTasks({
        inspector: 'admin',
      });

      const callWhere = (prisma.inspection_archive_tasks.findMany as any).mock
        .calls[0][0].where;
      expect(callWhere.inspector).toBe('admin');
    });

    it('should filter by status when provided', async () => {
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue([]);
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(0);

      await InspectionArchiveTaskService.getArchiveTasks({
        status: 'ARCHIVED',
      });

      const callWhere = (prisma.inspection_archive_tasks.findMany as any).mock
        .calls[0][0].where;
      expect(callWhere.status).toBe('ARCHIVED');
    });

    it('should return empty results on schema mismatch', async () => {
      const { isPrismaSchemaMismatchError } = await import(
        '~/utils/prisma-error'
      );
      vi.mocked(isPrismaSchemaMismatchError).mockReturnValue(true);
      (prisma.inspection_archive_tasks.findMany as any).mockRejectedValue(
        new Error('schema mismatch'),
      );

      const result = await InspectionArchiveTaskService.getArchiveTasks({});

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should rethrow non-schema errors', async () => {
      const { isPrismaSchemaMismatchError } = await import(
        '~/utils/prisma-error'
      );
      vi.mocked(isPrismaSchemaMismatchError).mockReturnValue(false);
      (prisma.inspection_archive_tasks.findMany as any).mockRejectedValue(
        new Error('db error'),
      );

      await expect(
        InspectionArchiveTaskService.getArchiveTasks({}),
      ).rejects.toThrow('db error');
    });

    it('should default page to 1 and pageSize to 20', async () => {
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue([]);
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(0);

      await InspectionArchiveTaskService.getArchiveTasks({});

      const callArgs = (prisma.inspection_archive_tasks.findMany as any).mock
        .calls[0][0];
      expect(callArgs.skip).toBe(0);
      expect(callArgs.take).toBe(20);
    });

    it('should clamp pageSize to max 200', async () => {
      (prisma.inspection_archive_tasks.findMany as any).mockResolvedValue([]);
      (prisma.inspection_archive_tasks.count as any).mockResolvedValue(0);

      await InspectionArchiveTaskService.getArchiveTasks({ pageSize: 500 });

      const callArgs = (prisma.inspection_archive_tasks.findMany as any).mock
        .calls[0][0];
      expect(callArgs.take).toBe(200);
    });
  });

  describe('updateArchiveTaskStatus', () => {
    it('should throw when task does not exist', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue(
        null,
      );

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'IN_PROGRESS',
        }),
      ).rejects.toThrow('归档任务不存在');
    });

    it('should throw when task is soft-deleted', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: true,
      });

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'IN_PROGRESS',
        }),
      ).rejects.toThrow('归档任务不存在');
    });

    it('should throw on invalid status', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
      });

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'INVALID' as any,
        }),
      ).rejects.toThrow('归档状态不合法');
    });

    it('should update to IN_PROGRESS successfully', async () => {
      const existing = {
        id: 'at-1',
        isDeleted: false,
        dueAt: new Date('2099-01-01'),
        workContent: 'old content',
      };
      const updated = { id: 'at-1', status: 'IN_PROGRESS' };
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue(
        existing,
      );
      (prisma.inspection_archive_tasks.update as any).mockResolvedValue(
        updated,
      );

      const result = await InspectionArchiveTaskService.updateArchiveTaskStatus(
        {
          id: 'at-1',
          status: 'IN_PROGRESS',
        },
      );

      expect(result).toEqual(updated);
    });

    it('should throw on ARCHIVED without workOrderNumber', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
        dueAt: new Date('2099-01-01'),
        projectName: 'P1',
        workOrderNumber: null,
      });

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'ARCHIVED',
        }),
      ).rejects.toThrow('工单号或项目名称缺失，无法归档');
    });

    it('should throw on ARCHIVED without workContent', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
        dueAt: new Date('2099-01-01'),
        projectName: 'P1',
        workContent: '',
        workOrderNumber: 'WO-001',
      });

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'ARCHIVED',
        }),
      ).rejects.toThrow('请先填写工作内容再归档');
    });

    it('should throw on ARCHIVED without attachments', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
        attachments: '',
        dueAt: new Date('2099-01-01'),
        projectName: 'P1',
        workContent: 'done',
        workOrderNumber: 'WO-001',
      });

      await expect(
        InspectionArchiveTaskService.updateArchiveTaskStatus({
          id: 'at-1',
          status: 'ARCHIVED',
        }),
      ).rejects.toThrow('请先上传至少一份资料附件再归档');
    });

    it('should set archivedAt when status is ARCHIVED', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
        attachments: 'file.pdf',
        dueAt: new Date('2099-01-01'),
        projectName: 'P1',
        workContent: 'done',
        workOrderNumber: 'WO-001',
      });
      (prisma.inspection_archive_tasks.update as any).mockResolvedValue({});

      await InspectionArchiveTaskService.updateArchiveTaskStatus({
        id: 'at-1',
        status: 'ARCHIVED',
      });

      const callData = (prisma.inspection_archive_tasks.update as any).mock
        .calls[0][0].data;
      expect(callData.status).toBe('ARCHIVED');
      expect(callData.archivedAt).toBeInstanceOf(Date);
    });

    it('should set archivedAt to null for non-ARCHIVED status', async () => {
      (prisma.inspection_archive_tasks.findUnique as any).mockResolvedValue({
        id: 'at-1',
        isDeleted: false,
        dueAt: new Date('2099-01-01'),
        workContent: 'content',
        workOrderNumber: 'WO-001',
      });
      (prisma.inspection_archive_tasks.update as any).mockResolvedValue({});

      await InspectionArchiveTaskService.updateArchiveTaskStatus({
        id: 'at-1',
        status: 'PENDING',
      });

      const callData = (prisma.inspection_archive_tasks.update as any).mock
        .calls[0][0].data;
      expect(callData.archivedAt).toBeNull();
    });
  });
});
