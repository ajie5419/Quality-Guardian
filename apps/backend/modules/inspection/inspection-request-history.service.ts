import type { Prisma } from '@prisma/client';

import prisma from '~/utils/prisma';

export interface SupplierHistoryProject {
  lastSubmittedAt: null | string;
  projectName: null | string;
  workOrderNumber: string;
}

function buildSupplierRequestWhere(params: {
  supplierName: string;
}): Prisma.qms_inspection_requestsWhereInput {
  return {
    isDeleted: false,
    team: params.supplierName,
  };
}

export const InspectionRequestHistoryService = {
  async getSupplierHistoryProjects(params: {
    limit?: number;
    supplierName: string;
  }): Promise<SupplierHistoryProject[]> {
    const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 100);
    const grouped = await prisma.qms_inspection_requests.groupBy({
      by: ['workOrderNumber'],
      where: buildSupplierRequestWhere(params),
      _max: { submittedAt: true },
      orderBy: { _max: { submittedAt: 'desc' } },
      take: limit,
    });
    const workOrderNumbers = grouped.map((item) => item.workOrderNumber);
    if (workOrderNumbers.length === 0) return [];

    const workOrders = await prisma.work_orders.findMany({
      select: { projectName: true, workOrderNumber: true },
      where: {
        workOrderNumber: { in: workOrderNumbers },
        isDeleted: false,
      },
    });
    const projectNameByWorkOrder = new Map(
      workOrders.map((item) => [item.workOrderNumber, item.projectName]),
    );

    return grouped.map((item) => ({
      workOrderNumber: item.workOrderNumber,
      projectName: projectNameByWorkOrder.get(item.workOrderNumber) ?? null,
      lastSubmittedAt:
        item._max.submittedAt instanceof Date
          ? item._max.submittedAt.toISOString()
          : null,
    }));
  },
};
