import { Prisma } from '@prisma/client';
import { FileStorageService } from '~/modules/file-storage';
import { buildWorkOrderWhereCondition } from '~/modules/work-order/work-order.service';
import prisma from '~/utils/prisma';
import { resolveCanonicalProcessName } from '~/utils/process-resolver';

import { buildRequirementSummaryMap } from './work-order-requirement-summary';

type WorkOrderRequirementCreatePayload =
  Prisma.work_order_requirementsUncheckedCreateInput;

type WorkOrderRequirementMutationParams = {
  data: Prisma.work_order_requirementsUpdateManyMutationInput;
  expectedConfirmStatus?: 'CONFIRMED' | 'PENDING';
  id: string;
  workOrderWhere: Prisma.work_ordersWhereInput;
};

const mutationSelect = {
  confirmedAt: true,
  confirmer: true,
  confirmStatus: true,
  id: true,
  requirementName: true,
  workOrderNumber: true,
} satisfies Prisma.work_order_requirementsSelect;

export const WorkOrderRequirementService = {
  async registerAttachmentReferences(params: {
    attachments?: string;
    bizId: string;
    tx?: Prisma.TransactionClient;
  }) {
    await FileStorageService.registerReferencesFromAttachments({
      attachments: params.attachments,
      bizId: params.bizId,
      bizType: 'work_order_requirement',
      ...(params.tx ? { tx: params.tx } : {}),
    });
  },

  async createMany(
    payloads: WorkOrderRequirementCreatePayload[],
    tx?: Prisma.TransactionClient,
  ) {
    if (tx) {
      return Promise.all(
        payloads.map((data) =>
          tx.work_order_requirements.create({
            data,
            select: { id: true, requirementName: true, workOrderNumber: true },
          }),
        ),
      );
    }
    return prisma.$transaction(
      payloads.map((data) =>
        prisma.work_order_requirements.create({
          data,
          select: { id: true, requirementName: true, workOrderNumber: true },
        }),
      ),
    );
  },

  async updateActiveById(
    params: WorkOrderRequirementMutationParams,
    tx?: Prisma.TransactionClient,
  ) {
    const update = async (db: Prisma.TransactionClient) => {
      const result = await db.work_order_requirements.updateMany({
        where: {
          id: params.id,
          isDeleted: false,
          status: 'active',
          work_order: params.workOrderWhere,
          ...(params.expectedConfirmStatus
            ? { confirmStatus: params.expectedConfirmStatus }
            : {}),
        },
        data: params.data,
      });
      if (result.count === 0) return null;
      return db.work_order_requirements.findFirst({
        where: { id: params.id, isDeleted: false, status: 'active' },
        select: mutationSelect,
      });
    };
    return tx ? update(tx) : prisma.$transaction(update);
  },

  async findActiveMutationState(
    id: string,
    workOrderWhere: Prisma.work_ordersWhereInput,
  ) {
    return prisma.work_order_requirements.findFirst({
      where: {
        id,
        isDeleted: false,
        status: 'active',
        work_order: workOrderWhere,
      },
      select: { confirmStatus: true, id: true },
    });
  },

  async softDeleteById(
    params: {
      id: string;
      updatedBy: string;
      workOrderWhere: Prisma.work_ordersWhereInput;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? prisma;
    return db.work_order_requirements.updateMany({
      where: {
        id: params.id,
        isDeleted: false,
        status: 'active',
        work_order: params.workOrderWhere,
      },
      data: {
        isDeleted: true,
        status: 'deleted',
        updatedBy: params.updatedBy,
      },
    });
  },

  async softDeleteAttachmentReferences(
    id: string,
    tx?: Prisma.TransactionClient,
  ) {
    await FileStorageService.softDeleteReferences({
      bizId: id,
      bizType: 'work_order_requirement',
      ...(tx ? { tx } : {}),
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
