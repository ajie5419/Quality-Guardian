import type { UserSession } from '~/utils/jwt-utils';

import { Prisma } from '@prisma/client';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { WelderScoreRefreshService } from '~/modules/welder';
import { BusinessError } from '~/utils/business-error';

import {
  buildInspectionIssueCreateData,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
  normalizeOptionalInspectionIssueString,
} from './inspection-issue';
import { reserveInspectionIssueNcNumber } from './inspection-issue-nc-number.service';
import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { assertWelderForWeldingDefect } from './inspection-issue-welding';

type IssueCreateTransaction = Prisma.TransactionClient;

export interface InspectionIssueCreateResult {
  ncNumber: null | string;
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
    const ncNumber = body.generateNcNumber
      ? await reserveInspectionIssueNcNumber(options.tx)
      : null;
    const createData = await buildInspectionIssueCreateData(
      {
        ...body,
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
        nonConformanceNumber: ncNumber,
        serialNumber: await getNextInspectionIssueSerialNumber(options.tx),
      },
    );
    await assertWelderForWeldingDefect(body, options.tx);
    const responsibleWelderId =
      await WelderScoreRefreshService.resolveResponsibleWelderId(
        options.tx,
        body.responsibleWelder,
      );
    const record = await options.tx.quality_records.create({
      data: {
        ...createData,
        responsibleDepartmentId: responsibility.responsibleDepartmentId,
        responsibilityType: responsibility.responsibilityType,
        responsibleWelderId,
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
    await WelderScoreRefreshService.enqueueForResponsibleText(
      options.tx,
      [record.responsibleWelder],
      'inspection-issue.created',
    );
    return { ncNumber, record };
  },
};

function rejectLegacyIssueCreateFields(
  body: Record<string, unknown>,
): Record<string, unknown> {
  validateOnlineInspectionIssueResponsibilityInput(body);
  return { ...body, generateNcNumber: body.generateNcNumber === true };
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
  if (body.ncNumber !== undefined || body.nonConformanceNumber !== undefined) {
    throw new BusinessError(
      'VALIDATION',
      '不合格编号由系统生成，不能手工提交',
      400,
    );
  }
}
