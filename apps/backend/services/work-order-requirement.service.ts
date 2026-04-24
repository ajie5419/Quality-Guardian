import { Prisma } from '@prisma/client';
import prisma from '~/utils/prisma';

import { buildWorkOrderWhereCondition } from './work-order.service';

export const WorkOrderRequirementService = {
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
      default: {
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
          requirementName: true,
          responsiblePerson: true,
          responsibleTeam: true,
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

    return {
      items,
      total,
    };
  },
};
