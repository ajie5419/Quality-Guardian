import type { UserSession } from '~/utils/jwt-utils';

import { Prisma } from '@prisma/client';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
  normalizeOptionalInspectionIssueString,
} from './inspection-issue';
import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { assertWelderForWeldingDefect } from './inspection-issue-welding';

type IssueCreateTransaction = Prisma.TransactionClient;

const logger = createModuleLogger('InspectionIssueCreate');

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
    await QualityLossIndexQueue.enqueue(
      options.tx,
      [{ source: 'INTERNAL', sourcePk: record.id }],
      'inspection-issue.created',
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

async function reserveInspectionIssueNcNumber(tx: IssueCreateTransaction) {
  const year = new Date().getFullYear();
  const prefix = `NC-${String(year).slice(-2)}KJ-`;
  const name = `inspection_issue_nc_${year}`;
  const latestLegacyRows = await tx.$queryRaw<
    Array<{ value: bigint | null | number }>
  >(Prisma.sql`
    SELECT MAX(CAST(SUBSTRING(nonConformanceNumber, ${prefix.length + 1}) AS UNSIGNED)) AS value
    FROM quality_records
    WHERE nonConformanceNumber LIKE ${`${prefix}%`}
  `);
  const latestLegacyValue = Number(latestLegacyRows[0]?.value ?? 0);
  const floorValue = Number.isFinite(latestLegacyValue)
    ? latestLegacyValue + 1
    : 1;
  // Compare-and-set loop keeps NC allocation race-free: each transaction
  // reads the current sequence, computes a candidate above the legacy MAX,
  // and only wins when it writes the value it just read. Losers retry and
  // observe the winner's value, so concurrent creates always diverge.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const existing = await tx.sequences.findUnique({ where: { name } });
    if (!existing) {
      try {
        await tx.sequences.create({ data: { currentValue: 1, name, prefix } });
      } catch (error) {
        logger.error(
          { err: error },
          'inspection issue NC sequence row could not be created',
        );
        if (!isPrismaUniqueConstraintError(error)) throw error;
      }
      continue;
    }
    const candidate = Math.max(existing.currentValue + 1, floorValue);
    const updated = await tx.sequences.updateMany({
      where: { name, currentValue: existing.currentValue },
      data: { currentValue: candidate },
    });
    if (updated.count === 1) {
      return `${prefix}${String(candidate).padStart(3, '0')}`;
    }
  }
  throw new BusinessError('CONFLICT', '不合格项编号生成失败，请重试', 409);
}
