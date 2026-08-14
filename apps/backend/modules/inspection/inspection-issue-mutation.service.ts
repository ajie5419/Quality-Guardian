import type { UserSession } from '~/utils/jwt-utils';

import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import {
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
  getNextInspectionIssueSerialNumber,
  hasInspectionIssueWriteAccess,
} from './inspection-issue';
import {
  applyInspectionIssueWriteOwnership,
  InspectionIssueAccessService,
} from './inspection-issue-access.service';
import {
  InspectionIssueCreateService,
  validateOnlineInspectionIssueResponsibilityInput,
} from './inspection-issue-create.service';
import { reserveInspectionIssueNcNumber } from './inspection-issue-nc-number.service';
import { resolveInspectionIssueResponsibility } from './inspection-issue-responsibility.service';
import { assertWelderForWeldingDefect } from './inspection-issue-welding';

const logger = createModuleLogger('InspectionIssueMutation');

type RequestBody = Record<string, unknown>;

export const InspectionIssueMutationService = {
  async createIssue(userinfo: UserSession, body: RequestBody) {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.CREATE,
    );
    const sourceType = String(body.sourceType || '')
      .trim()
      .toUpperCase();
    if (
      (sourceType === 'INSPECTION' || sourceType === 'INSPECTION_RECORD') &&
      !String(body.inspectionId || '').trim()
    ) {
      throw new Error(
        'BAD_REQUEST:检验记录来源创建不合格项时必须携带 inspectionId',
      );
    }
    const newRecord = await createIssueWithSerialRetry(async () =>
      prisma.$transaction(async (tx) =>
        InspectionIssueCreateService.createInTransaction({
          body,
          tx,
          userinfo,
        }),
      ),
    );
    try {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.photos,
        bizId: String(newRecord.record.id),
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    } catch (error) {
      logger.error(
        error,
        'inspection-issue attachment references after create',
      );
    }
    // The write has committed, so audit failure must not make callers retry an
    // irreversible NC assignment.
    try {
      await SystemLogService.auditLog('inspection', 'issueCreate', {
        userId: String(userinfo.id),
        targetId: String(newRecord.record.id),
        detailsVariables: {
          nonConformanceNumber:
            newRecord.record.nonConformanceNumber || '无编号',
          partName: newRecord.record.partName,
        },
      });
    } catch (error) {
      logger.error(error, 'inspection-issue audit after create');
    }
    try {
      await WelderScoreService.syncFromInspectionIssues();
    } catch (error) {
      logger.error(error, 'welder-score-sync after createIssue');
    }
    return { ...newRecord.record, ncNumber: newRecord.ncNumber };
  },

  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
    const userContext = await InspectionIssueAccessService.getAccessContext(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.EDIT,
    );
    const ownershipWhere = applyInspectionIssueWriteOwnership(
      { id, isDeleted: false },
      userContext,
    );
    const { updateData } = await prisma.$transaction(async (tx) => {
      validateOnlineInspectionIssueResponsibilityInput(body);
      const current = await tx.quality_records.findUnique({
        where: ownershipWhere,
        select: {
          defectSubcategoryId: true,
          inspection: {
            select: { category: true, supplierId: true, teamId: true },
          },
          processName: true,
          responsibilityType: true,
          responsibleDepartmentId: true,
          responsibleWelder: true,
          supplierId: true,
          supplierName: true,
        },
      });
      if (!current) {
        throw new BusinessError(
          'FORBIDDEN',
          '无权修改：您只能修改自己创建的数据',
          403,
        );
      }
      const responsibility = hasInspectionIssueResponsibilityUpdate(body)
        ? await resolveInspectionIssueResponsibility(
            mergeResponsibilityInput(body, current),
            tx,
          )
        : null;
      const canonicalBody = responsibility
        ? {
            ...body,
            responsibleDepartment: responsibility.responsibleDepartment,
            responsibleDepartmentId: responsibility.responsibleDepartmentId,
            responsibilityType: responsibility.responsibilityType,
            supplierId: responsibility.supplierId ?? '',
            supplierName: responsibility.supplierName ?? '',
          }
        : body;
      const updateData = await buildInspectionIssueUpdateData(
        canonicalBody,
        undefined,
        current.inspection,
      );
      // The update payload is partial, so validate the merged final state
      // (body overrides over the current record) for welding defects.
      await assertWelderForWeldingDefect(
        {
          defectSubcategoryId:
            canonicalBody.defectSubcategoryId ?? current.defectSubcategoryId,
          processName: canonicalBody.processName ?? current.processName,
          responsibleWelder:
            canonicalBody.responsibleWelder ?? current.responsibleWelder,
        },
        tx,
      );
      const updated = await tx.quality_records.update({
        where: ownershipWhere,
        data: responsibility
          ? {
              ...updateData,
              responsibleDepartmentId: responsibility.responsibleDepartmentId,
              responsibilityType: responsibility.responsibilityType,
            }
          : updateData,
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [current.supplierId, updated.supplierId],
        'inspection-issue.updated',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'INTERNAL', sourcePk: updated.id }],
        'inspection-issue.updated',
      );
      return { updateData };
    });
    if (body.photos !== undefined) {
      await FileStorageService.registerReferencesFromAttachments({
        attachments: body.photos,
        bizId: String(id),
        bizType: 'inspection_issue',
        fieldName: 'photos',
      });
    }
    await SystemLogService.auditLog('inspection', 'issueUpdate', {
      userId: String(userinfo.id),
      targetId: String(id),
      detailsVariables: {
        nonConformanceNumber:
          updateData.nonConformanceNumber || existingNcNumber || '无编号',
        partName: updateData.partName || '未修改名称',
      },
    });
    try {
      await WelderScoreService.syncFromInspectionIssues();
    } catch (error) {
      logger.error(error, 'welder-score-sync after updateIssue');
    }
  },

  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    const userContext = await InspectionIssueAccessService.getAccessContext(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.DELETE,
    );
    const uniqueIds = [...new Set(ids)];
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.quality_records.findMany({
        where: { id: { in: uniqueIds }, isDeleted: false },
        select: {
          createdBy: true,
          id: true,
          supplierId: true,
        },
      });
      if (
        existing.length !== uniqueIds.length ||
        existing.some(
          (item) =>
            !hasInspectionIssueWriteAccess({
              createdBy: item.createdBy,
              roles: userContext.roles,
              userId: userContext.userId,
            }),
        )
      ) {
        throw new BusinessError(
          'FORBIDDEN',
          '无权删除：只能批量删除自己创建的数据',
          403,
        );
      }
      const result = await tx.quality_records.updateMany({
        where: applyInspectionIssueWriteOwnership(
          { id: { in: uniqueIds }, isDeleted: false },
          userContext,
        ),
        data: { isDeleted: true, updatedAt: new Date() },
      });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        existing.map((item) => item.supplierId),
        'inspection-issue.batch-deleted',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        existing.map((item) => ({ source: 'INTERNAL', sourcePk: item.id })),
        'inspection-issue.batch-deleted',
      );
      return result;
    });
    if (result.count > 0) {
      try {
        await WelderScoreService.syncFromInspectionIssues();
      } catch (error) {
        logger.error(error, 'welder-score-sync after batchDeleteIssues');
      }
    }
    await Promise.all(
      uniqueIds.map((id) =>
        FileStorageService.softDeleteReferences({
          bizId: id,
          bizType: 'inspection_issue',
        }),
      ),
    );
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'DELETE',
      targetType: 'inspection_issue',
      targetId: uniqueIds.join(','),
      detailsTemplate: '批量删除不合格品项: {{count}} 条',
      detailsVariables: { count: result.count },
    });
    return result.count;
  },

  async importIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    items: Array<Record<string, unknown>>,
    generateNcNumber = false,
  ) {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.CREATE,
    );
    let successCount = 0;
    const rowErrors = [];
    let serialSeed = await getNextInspectionIssueSerialNumber();
    const createdBy = String(userinfo.id || userinfo.userId || '') || undefined;
    for (const [index, item] of items.entries()) {
      try {
        rejectSubmittedImportNcNumber(item);
        const payload = await buildInspectionIssueUpsertPayload(
          item,
          serialSeed,
          { createdBy, nonConformanceNumber: null },
        );
        serialSeed++;
        try {
          await prisma.$transaction(async (tx) => {
            const nonConformanceNumber = generateNcNumber
              ? await reserveInspectionIssueNcNumber(tx)
              : null;
            const saved = await tx.quality_records.create({
              data: { ...payload, nonConformanceNumber },
            });
            await MetricRefreshQueue.enqueueSupplierScores(
              tx,
              [saved.supplierId],
              'inspection-issue.imported',
            );
            await QualityLossIndexQueue.enqueue(
              tx,
              [{ source: 'INTERNAL', sourcePk: saved.id }],
              'inspection-issue.imported',
            );
          });
          successCount++;
        } catch (upsertError) {
          // On a serialNumber unique conflict, re-fetch the current max so the
          // next row starts from a safe value, then re-throw so the row is
          // recorded as an error (upsert conflicts are non-retryable here because
          // the payload was already built with the old serial).
          if (isSerialNumberConflict(upsertError)) {
            serialSeed = await getNextInspectionIssueSerialNumber();
          }
          throw upsertError;
        }
      } catch (error) {
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'ncNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    if (successCount > 0) {
      try {
        await WelderScoreService.syncFromInspectionIssues();
      } catch (error) {
        logger.error(error, 'welder-score-sync after importIssues');
      }
    }
    await recordBusinessAuditLog(event, {
      userId: userinfo.id,
      action: 'CREATE',
      targetType: 'inspection_issue',
      targetId: 'batch-import',
      detailsTemplate: '导入不合格品项: {{successCount}}/{{totalCount}} 条',
      detailsVariables: { successCount, totalCount: items.length },
    });
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
};

/**
 * Returns true when the Prisma error is a P2002 unique-constraint violation
 * targeting the serialNumber column in quality_records.
 */
function isSerialNumberConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const message = String((error as { message?: string })?.message || '');
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targetStr = Array.isArray(target)
    ? target.join(',')
    : String(target ?? '');
  return message.includes('serialNumber') || targetStr.includes('serialNumber');
}

function hasInspectionIssueResponsibilityUpdate(body: RequestBody) {
  return (
    body.responsibilityType !== undefined ||
    body.responsibleDepartmentId !== undefined ||
    body.supplierId !== undefined
  );
}

function rejectSubmittedImportNcNumber(item: Record<string, unknown>) {
  for (const key of ['ncNumber', 'nonConformanceNumber'] as const) {
    const value = item[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      throw new BusinessError(
        'VALIDATION',
        '导入不支持手工填写不合格编号',
        400,
      );
    }
  }
}

function mergeResponsibilityInput(
  body: RequestBody,
  current: {
    responsibilityType: null | string;
    responsibleDepartmentId: null | string;
    supplierId: null | string;
  },
) {
  return {
    responsibilityType: String(
      body.responsibilityType ?? current.responsibilityType ?? '',
    ).trim(),
    responsibleDepartmentId: String(
      body.responsibleDepartmentId ?? current.responsibleDepartmentId ?? '',
    ).trim(),
    supplierId: String(body.supplierId ?? current.supplierId ?? '').trim(),
  };
}

/**
 * Executes `run` up to 3 times for generated serial identifier conflicts.
 */
async function createIssueWithSerialRetry<T>(
  run: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= maxAttempts || !isSerialNumberConflict(error)) {
        throw error;
      }
    }
  }
}
