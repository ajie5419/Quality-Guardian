import type { Prisma } from '@prisma/client';

import * as qgsDomain from '@qgs/shared';
import {
  parseResponsibleDepartments,
  serializeResponsibleDepartments,
} from '~/utils/department-multi';

const { buildAfterSalesCreateData, buildAfterSalesUpdateData } = qgsDomain;
export { buildAfterSalesCreateData, buildAfterSalesUpdateData };

function assertAfterSalesPayloadBuilders(): void {
  if (
    typeof buildAfterSalesCreateData !== 'function' ||
    typeof buildAfterSalesUpdateData !== 'function'
  ) {
    throw new TypeError(
      'After-sales payload builders are not available from @qgs/shared runtime exports.',
    );
  }
}

function normalizeResponsibleDepartments(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return parseResponsibleDepartments(value)
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  return [];
}

function attachResponsibleDepartmentsToAfterSalesData<
  T extends {
    feedbackDept?: unknown;
    respDept?: unknown;
    responsibleDepartments?: unknown;
  },
>(body: Record<string, unknown>, data: T): T {
  const departments = normalizeResponsibleDepartments(
    body.responsibleDepartments,
  );
  if (departments.length === 0) {
    return data;
  }
  return {
    ...data,
    feedbackDept: departments[0],
    respDept: departments[0],
    responsibleDepartments: serializeResponsibleDepartments(departments),
  };
}

export async function buildGovernedAfterSalesCreateData(
  body: Record<string, unknown>,
  options: {
    defaultWorkOrderNumber: string;
    id: string;
    serialNumber: number;
  },
): Promise<Prisma.after_salesUncheckedCreateInput> {
  assertAfterSalesPayloadBuilders();
  const createData = buildAfterSalesCreateData(
    body,
    options,
  ) as unknown as Prisma.after_salesUncheckedCreateInput;
  return attachResponsibleDepartmentsToAfterSalesData(body, createData);
}

export async function buildGovernedAfterSalesUpdateData(
  body: Record<string, unknown>,
): Promise<{
  costsChanged: boolean;
  data: Prisma.after_salesUncheckedUpdateInput;
}> {
  assertAfterSalesPayloadBuilders();
  const result = buildAfterSalesUpdateData(body) as unknown as {
    costsChanged: boolean;
    data: Prisma.after_salesUncheckedUpdateInput;
  };
  return {
    ...result,
    data: attachResponsibleDepartmentsToAfterSalesData(body, result.data),
  };
}
