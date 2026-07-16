import { Prisma } from '@prisma/client';
import { FileStorageService } from '~/modules/file-storage';
import { buildWorkOrderWhereCondition } from '~/modules/work-order/work-order.service';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import { buildRequirementSummaryMap } from './work-order-requirement-summary';

type WorkOrderRequirementCreatePayload =
  Prisma.work_order_requirementsUncheckedCreateInput;

export const WorkOrderRequirementService = {
  async registerAttachmentReferences(params: {
    attachments?: string;
    bizId: string;
  }) {
    await FileStorageService.registerReferencesFromAttachments({
      attachments: params.attachments,
      bizId: params.bizId,
      bizType: 'work_order_requirement',
    });
  },

  async createMany(payloads: WorkOrderRequirementCreatePayload[]) {
    return prisma.$transaction(
      payloads.map((data) =>
        prisma.work_order_requirements.create({
          data,
          select: { id: true, requirementName: true, workOrderNumber: true },
        }),
      ),
    );
  },

  async updateById(
    id: string,
    data: Prisma.work_order_requirementsUpdateInput,
  ) {
    return prisma.work_order_requirements.update({
      where: { id },
      data,
      select: {
        confirmedAt: true,
        confirmer: true,
        confirmStatus: true,
        id: true,
        requirementName: true,
        workOrderNumber: true,
      },
    });
  },

  async findActiveByWorkOrder(workOrderNumber: string) {
    return prisma.work_order_requirements.findMany({
      where: { isDeleted: false, status: 'active', workOrderNumber },
      orderBy: [{ updatedAt: 'desc' }],
      select: {
        attachment: true,
        confirmer: true,
        confirmedAt: true,
        confirmStatus: true,
        createdAt: true,
        id: true,
        partName: true,
        processName: true,
        process: { select: { name: true } },
        requirementItems: true,
        requirementName: true,
        responsiblePerson: true,
        responsibleTeam: true,
        responsibleTeamId: true,
        workOrderNumber: true,
      },
    });
  },

  async findActiveForAggregate(workOrderNumber: string) {
    return prisma.work_order_requirements.findMany({
      where: { isDeleted: false, status: 'active', workOrderNumber },
      select: {
        attachment: true,
        confirmer: true,
        confirmedAt: true,
        confirmStatus: true,
        createdAt: true,
        requirementItems: true,
        requirementName: true,
        id: true,
        partName: true,
        processName: true,
        process: { select: { name: true } },
        responsiblePerson: true,
        responsibleTeam: true,
        responsibleTeamId: true,
      },
    });
  },

  async getSummaryByWorkOrderNumbers(workOrderNumbers: string[]) {
    const normalized = [
      ...new Set(workOrderNumbers.map((item) => item.trim())),
    ].filter(Boolean);
    if (normalized.length === 0) return buildRequirementSummaryMap([]);

    const rows = await prisma.work_order_requirements.findMany({
      where: {
        isDeleted: false,
        status: 'active',
        workOrderNumber: { in: normalized },
      },
      select: {
        confirmStatus: true,
        createdAt: true,
        workOrderNumber: true,
      },
    });
    return buildRequirementSummaryMap(rows);
  },

  async getRequirementOverview(
    params: Parameters<typeof buildWorkOrderWhereCondition>[0],
  ) {
    const workOrderWhere = await buildWorkOrderWhereCondition(params);
    const requirementWhere: Prisma.work_order_requirementsWhereInput = {
      isDeleted: false,
      status: 'active',
      work_order: workOrderWhere,
    };
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const [
      plannedRequirements,
      confirmedRequirements,
      overdueUnconfirmedRequirements,
    ] = await Promise.all([
      prisma.work_order_requirements.count({ where: requirementWhere }),
      prisma.work_order_requirements.count({
        where: {
          ...requirementWhere,
          confirmStatus: 'CONFIRMED',
        },
      }),
      prisma.work_order_requirements.count({
        where: {
          ...requirementWhere,
          NOT: { confirmStatus: 'CONFIRMED' },
          createdAt: { lt: overdueDate },
        },
      }),
    ]);

    return {
      confirmedRequirements,
      overdueUnconfirmedRequirements,
      pendingRequirements: Math.max(
        plannedRequirements - confirmedRequirements,
        0,
      ),
      plannedRequirements,
    };
  },

  async getRequirementBoard(
    params: Parameters<typeof buildWorkOrderWhereCondition>[0] & {
      filter?: 'all' | 'confirmed' | 'overdue' | 'pending';
      page?: number;
      pageSize?: number;
    },
  ) {
    const { page = 1, pageSize = 20, filter = 'all' } = params;
    const workOrderWhere = await buildWorkOrderWhereCondition(params);
    const overdueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const where: Prisma.work_order_requirementsWhereInput = {
      isDeleted: false,
      status: 'active',
      work_order: workOrderWhere,
    };

    switch (filter) {
      case 'all': {
        break;
      }
      case 'confirmed': {
        where.confirmStatus = 'CONFIRMED';
        break;
      }
      case 'overdue': {
        where.NOT = { confirmStatus: 'CONFIRMED' };
        where.createdAt = { lt: overdueDate };
        break;
      }
      case 'pending': {
        where.NOT = { confirmStatus: 'CONFIRMED' };
        break;
      }
    }

    const [items, total] = await Promise.all([
      prisma.work_order_requirements.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: 'desc' }],
        select: {
          attachment: true,
          confirmer: true,
          confirmedAt: true,
          confirmStatus: true,
          createdAt: true,
          id: true,
          partName: true,
          processName: true,
          process: {
            select: {
              name: true,
            },
          },
          requirementName: true,
          responsiblePerson: true,
          responsibleTeam: true,
          responsibleTeamId: true,
          workOrderNumber: true,
          work_order: {
            select: {
              customerName: true,
              division: true,
              projectName: true,
              status: true,
            },
          },
        },
      }),
      prisma.work_order_requirements.count({ where }),
    ]);

    const normalizedItems = items.map((item) => {
      const { process, ...rest } = item;
      return {
        ...rest,
        processName:
          resolveCanonicalProcessName({
            process,
            processName: item.processName,
          }) || null,
      };
    });

    return {
      items: normalizedItems,
      total,
    };
  },
};
