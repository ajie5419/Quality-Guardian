import { Prisma } from '@prisma/client';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaSchemaMismatchError } from '~/utils/prisma-error';

export type ArchiveTaskStatus =
  | 'ARCHIVED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'REJECTED';

const logger = createModuleLogger('InspectionService');

export const InspectionArchiveTaskService = {
  async getArchiveTasks(params: {
    date?: string;
    inspector?: string;
    page?: number;
    pageSize?: number;
    status?: ArchiveTaskStatus;
  }) {
    const page = Math.max(1, Number(params.page || 1));
    const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
    const date = params.date ? new Date(params.date) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const where: Prisma.inspection_archive_tasksWhereInput = {
      inspectionDate: { gte: start, lte: end },
      isDeleted: false,
    };

    if (params.inspector) {
      where.inspector = params.inspector;
    }
    if (params.status) {
      where.status = params.status;
    }

    let items = [] as Awaited<
      ReturnType<typeof prisma.inspection_archive_tasks.findMany>
    >;
    let total = 0;
    try {
      [items, total] = await Promise.all([
        prisma.inspection_archive_tasks.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        }),
        prisma.inspection_archive_tasks.count({ where }),
      ]);
    } catch (error) {
      if (!isPrismaSchemaMismatchError(error)) {
        throw error;
      }
      logger.warn('Skip inspection archive tasks query: schema not ready');
      return { items: [], total: 0 };
    }

    const now = new Date();
    const normalizedItems = items.map((item) => ({
      ...item,
      isOverdue: item.status !== 'ARCHIVED' && now > item.dueAt,
    }));

    return { items: normalizedItems, total };
  },

  async updateArchiveTaskStatus(params: {
    id: string;
    status: ArchiveTaskStatus;
    workContent?: string;
  }) {
    const existing = await prisma.inspection_archive_tasks.findUnique({
      where: { id: params.id },
    });
    if (!existing || existing.isDeleted) {
      throw new Error('归档任务不存在');
    }

    const status = String(params.status || '')
      .trim()
      .toUpperCase() as ArchiveTaskStatus;
    if (!['ARCHIVED', 'IN_PROGRESS', 'PENDING', 'REJECTED'].includes(status)) {
      throw new Error('归档状态不合法');
    }

    const nextWorkContent =
      params.workContent === undefined
        ? String(existing.workContent || '').trim()
        : String(params.workContent || '').trim();

    if (status === 'ARCHIVED') {
      const hasAttachments = Boolean(String(existing.attachments || '').trim());
      if (!existing.workOrderNumber || !existing.projectName) {
        throw new Error('工单号或项目名称缺失，无法归档');
      }
      if (!nextWorkContent) {
        throw new Error('请先填写工作内容再归档');
      }
      if (!hasAttachments) {
        throw new Error('请先上传至少一份资料附件再归档');
      }
    }

    const now = new Date();
    const archivedAt = status === 'ARCHIVED' ? now : null;

    return prisma.inspection_archive_tasks.update({
      where: { id: params.id },
      data: {
        archivedAt,
        isOverdue: status !== 'ARCHIVED' && now > existing.dueAt,
        status,
        workContent: nextWorkContent || null,
      },
    });
  },
};
