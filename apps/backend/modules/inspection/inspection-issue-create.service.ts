import type { InspectionIssueResponsibilityType } from '@qgs/shared';
import type { UserSession } from '~/utils/jwt-utils';

import { Prisma } from '@prisma/client';
import {
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  normalizeInspectionIssueResponsibilityType,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexService } from '~/modules/quality-loss';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
  normalizeOptionalInspectionIssueString,
} from './inspection-issue';
import { assertWelderForWeldingDefect } from './inspection-issue-welding';

type IssueCreateTransaction = Prisma.TransactionClient;

export interface ResolvedInspectionIssueResponsibility {
  responsibleDepartment: string;
  responsibleDepartmentId: string;
  responsibilityType: InspectionIssueResponsibilityType;
  supplierId: null | string;
  supplierName: null | string;
}

export interface InspectionIssueCreateResult {
  ncNumber: string;
  record: Prisma.quality_recordsGetPayload<Record<string, never>>;
}

/**
 * All online issue entry points use this service so identity snapshots, NC
 * allocation, materialized loss rows, and metric jobs either commit together
 * or roll back together with their caller's transaction.
 */
export const InspectionIssueCreateService = {
  async createInTransaction(options: {
    body: Record<string, unknown>;
    tx: IssueCreateTransaction;
    userinfo: UserSession;
  }): Promise<InspectionIssueCreateResult> {
    const body = rejectLegacyIssueCreateFields(options.body);
    const inspection = await findInspectionForIssue(
      normalizeOptionalInspectionIssueString(body.inspectionId),
      options.tx,
    );
    const responsibility = await resolveInspectionIssueResponsibility(
      body,
      options.tx,
    );
    const ncNumber = await reserveInspectionIssueNcNumber(options.tx);
    const createData = await buildInspectionIssueCreateData(
      {
        ...body,
        ncNumber,
        responsibleDepartment: responsibility.responsibleDepartment,
        responsibleDepartmentId: responsibility.responsibleDepartmentId,
        responsibilityType: responsibility.responsibilityType,
        supplierId: responsibility.supplierId ?? undefined,
        supplierName: responsibility.supplierName ?? undefined,
      },
      {
        createdBy:
          String(options.userinfo.id || options.userinfo.userId || '') ||
          undefined,
        id: createInspectionIssueId(),
        inspection,
        inspectorUsername: options.userinfo.username,
        serialNumber: await getNextInspectionIssueSerialNumber(options.tx),
      },
    );
    await assertWelderForWeldingDefect(body, options.tx);
    const record = await options.tx.quality_records.create({
      data: {
        ...createData,
        responsibleDepartmentId: responsibility.responsibleDepartmentId,
        responsibilityType: responsibility.responsibilityType,
      },
    });
    await QualityLossIndexService.upsertFromInternalInTransaction(
      record,
      options.tx,
    );
    await MetricRefreshQueue.enqueueSupplierScores(
      options.tx,
      [record.supplierId],
      'inspection-issue.created',
    );
    return { ncNumber, record };
  },
};

function rejectLegacyIssueCreateFields(body: Record<string, unknown>) {
  validateOnlineInspectionIssueResponsibilityInput(body);
  const {
    ncNumber: _ignoredNcNumber,
    responsibleDepartments: _ignoredResponsibleDepartments,
    ...rest
  } = body;
  return rest;
}

export function validateOnlineInspectionIssueResponsibilityInput(
  body: Record<string, unknown>,
) {
  for (const key of [
    'responsibleDepartmentId',
    'responsibleDepartment',
    'supplierId',
  ] as const) {
    const value = body[key];
    if (value && typeof value === 'object') {
      throw new BusinessError('VALIDATION', `${key} 必须是 ID 字符串`, 400);
    }
    if (String(value ?? '').trim() === '[object Object]') {
      throw new BusinessError('VALIDATION', `${key} 不能是对象字符串`, 400);
    }
  }
  if (body.responsibleDepartments !== undefined) {
    throw new BusinessError('VALIDATION', '不支持多个责任部门', 400);
  }
}

export async function resolveInspectionIssueResponsibility(
  body: Record<string, unknown>,
  tx: IssueCreateTransaction,
): Promise<ResolvedInspectionIssueResponsibility> {
  const responsibilityType = normalizeInspectionIssueResponsibilityType(
    body.responsibilityType,
  );
  if (!responsibilityType) {
    throw new BusinessError('VALIDATION', '不合格项责任类型无效', 400);
  }
  const responsibleDepartmentId = normalizeOptionalInspectionIssueString(
    body.responsibleDepartmentId,
  );
  if (!responsibleDepartmentId) {
    throw new BusinessError('VALIDATION', '不合格项责任部门 ID 不能为空', 400);
  }
  const department = await DeptService.findActiveById(
    responsibleDepartmentId,
    tx,
  );
  if (!department) {
    throw new BusinessError('VALIDATION', '不合格项责任部门 ID 无效', 400);
  }

  const submittedSupplierId = normalizeOptionalInspectionIssueString(
    body.supplierId,
  );
  if (
    responsibilityType ===
    INSPECTION_ISSUE_RESPONSIBILITY_TYPE.INTERNAL_DEPARTMENT
  ) {
    if (submittedSupplierId) {
      throw new BusinessError(
        'VALIDATION',
        '内部责任部门不能同时指定供应商 ID',
        400,
      );
    }
    return {
      responsibleDepartment: department.name,
      responsibleDepartmentId: department.id,
      responsibilityType,
      supplierId: null,
      supplierName: null,
    };
  }
  if (!submittedSupplierId) {
    throw new BusinessError(
      'VALIDATION',
      '外部责任单位缺少 canonical 供应商 ID',
      400,
    );
  }
  const supplier = await SupplierIdentityService.resolveSupplierById(
    submittedSupplierId,
    tx,
  );
  if (!supplier) {
    throw new BusinessError('VALIDATION', '不合格项供应商 ID 无效', 400);
  }
  return {
    responsibleDepartment: department.name,
    responsibleDepartmentId: department.id,
    responsibilityType,
    supplierId: supplier.id,
    supplierName: supplier.name,
  };
}

async function reserveInspectionIssueNcNumber(tx: IssueCreateTransaction) {
  const year = new Date().getFullYear();
  const prefix = `NC-${String(year).slice(-2)}KJ-`;
  const name = `inspection_issue_nc_${year}`;
  let sequence = await tx.sequences.upsert({
    where: { name },
    create: { currentValue: 1, name, prefix },
    update: { currentValue: { increment: 1 } },
  });
  const latestLegacyRows = await tx.$queryRaw<
    Array<{ value: bigint | null | number }>
  >(Prisma.sql`
    SELECT MAX(CAST(SUBSTRING(nonConformanceNumber, ${prefix.length + 1}) AS UNSIGNED)) AS value
    FROM quality_records
    WHERE nonConformanceNumber LIKE ${`${prefix}%`}
  `);
  const latestLegacyValue = Number(latestLegacyRows[0]?.value ?? 0);
  if (
    Number.isFinite(latestLegacyValue) &&
    latestLegacyValue >= sequence.currentValue
  ) {
    sequence = await tx.sequences.update({
      where: { name },
      data: { currentValue: latestLegacyValue + 1, prefix },
    });
  }
  return `${prefix}${String(sequence.currentValue).padStart(3, '0')}`;
}
