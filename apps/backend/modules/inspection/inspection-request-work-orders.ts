import type { PrismaClient } from '@prisma/client';

import { normalizeInspectionRequestText } from './inspection-request';

export const inspectionRequestWorkOrdersInclude = {
  orderBy: { createdAt: 'asc' as const },
  select: { isPrimary: true, workOrderNumber: true },
};

export function normalizeInspectionRequestWorkOrderNumbers(
  body: Record<string, unknown>,
) {
  const values = Array.isArray(body.workOrderNumbers)
    ? body.workOrderNumbers
    : [body.workOrderNumber];
  const normalized = values
    .map((item) => normalizeInspectionRequestText(item))
    .filter(Boolean);
  return [...new Set(normalized)];
}

export function resolveRequestWorkOrderNumbers(request: {
  workOrderNumber: string;
  workOrders?: Array<{ workOrderNumber: string }>;
}) {
  const linkedNumbers = Array.isArray(request.workOrders)
    ? request.workOrders.map((item) => item.workOrderNumber)
    : [];
  return [
    ...new Set(
      [request.workOrderNumber, ...linkedNumbers]
        .map((item) => normalizeInspectionRequestText(item))
        .filter(Boolean),
    ),
  ];
}

export async function assertWorkOrdersExist(
  prisma: Pick<PrismaClient, 'work_orders'>,
  workOrderNumbers: string[],
) {
  const normalized = [...new Set(workOrderNumbers.map((item) => item.trim()))];
  const workOrders = await prisma.work_orders.findMany({
    select: { projectName: true, workOrderNumber: true },
    where: { workOrderNumber: { in: normalized } },
  });
  const existing = new Set(workOrders.map((item) => item.workOrderNumber));
  const missing = normalized.filter((item) => !existing.has(item));
  if (missing.length > 0) {
    throw new Error(`BAD_REQUEST:工单不存在：${missing.join(', ')}`);
  }
  return workOrders;
}
