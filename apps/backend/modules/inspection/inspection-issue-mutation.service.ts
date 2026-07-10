import type { UserSession } from '~/utils/jwt-utils';

import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { QualityLossIndexService } from '~/modules/quality-loss/quality-loss-index.service';
import { recordBusinessAuditLog } from '~/modules/system-log/audit-log';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import { eventBus } from '~/utils/event-bus';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from './inspection-issue';
import { InspectionIssueAccessService } from './inspection-issue-access.service';
import { InspectionIssueNumberingService } from './inspection-issue-numbering.service';

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
    const linkedInspection = await findInspectionForIssue(
      body.inspectionId as string | undefined,
    );
    const newId = createInspectionIssueId();
    const shouldGenerateNcNumber = !String(body.ncNumber || '').trim();

    // Aggregate-based serial and generated NC values can race under concurrent
    // creates, so both generated values are refreshed on a matching conflict.
    const newRecord = await createIssueWithSerialRetry(async () => {
      const serialNumber = await getNextInspectionIssueSerialNumber();
      const createBody = shouldGenerateNcNumber
        ? {
            ...body,
            ncNumber:
              await InspectionIssueNumberingService.generateNextNcNumber(),
          }
        : body;
      return prisma.quality_records.create({
        data: await buildInspectionIssueCreateData(createBody, {
          createdBy: String(userinfo.id || '') || undefined,
          id: newId,
          inspection: linkedInspection,
          inspectorUsername: userinfo.username,
          serialNumber,
        }),
      });
    }, shouldGenerateNcNumber);
    await FileStorageService.registerReferencesFromAttachments({
      attachments: body.photos,
      bizId: String(newRecord.id),
      bizType: 'inspection_issue',
      fieldName: 'photos',
    });
    await SystemLogService.auditLog('inspection', 'issueCreate', {
      userId: String(userinfo.id),
      targetId: String(newRecord.id),
      detailsVariables: {
        nonConformanceNumber: newRecord.nonConformanceNumber || '无编号',
        partName: newRecord.partName,
      },
    });
    await QualityLossIndexService.upsertFromInternal(newRecord);
    try {
      await WelderScoreService.syncFromInspectionIssues();
    } catch (error) {
      logger.error(error, 'welder-score-sync after createIssue');
    }
    eventBus.emit('inspection_issue.changed', {
      supplierNames: [newRecord.supplierName],
    });
    return { ...newRecord, ncNumber: newRecord.nonConformanceNumber };
  },

  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.EDIT,
    );
    const current = await prisma.quality_records.findUnique({
      where: { id },
      select: { supplierName: true },
    });
    const updateData = await buildInspectionIssueUpdateData(
      body,
      existingNcNumber,
    );
    const updated = await prisma.quality_records.update({
      where: { id },
      data: updateData,
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
    await QualityLossIndexService.upsertFromInternal(updated);
    try {
      await WelderScoreService.syncFromInspectionIssues();
    } catch (error) {
      logger.error(error, 'welder-score-sync after updateIssue');
    }
    eventBus.emit('inspection_issue.changed', {
      supplierNames: [
        current?.supplierName,
        updateData.supplierName as null | string | undefined,
      ],
    });
  },

  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.DELETE,
    );
    const existing = await prisma.quality_records.findMany({
      where: { id: { in: ids } },
      select: { supplierName: true },
    });
    const result = await prisma.quality_records.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    if (result.count > 0) {
      try {
        await WelderScoreService.syncFromInspectionIssues();
      } catch (error) {
        logger.error(error, 'welder-score-sync after batchDeleteIssues');
      }
    }
    await QualityLossIndexService.softDeleteSourceMany('Internal', ids);
    eventBus.emit('inspection_issue.changed', {
      supplierNames: existing.map((item) => item.supplierName),
    });
    await Promise.all(
      ids.map((id) =>
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
      targetId: ids.join(','),
      detailsTemplate: '批量删除不合格品项: {{count}} 条',
      detailsVariables: { count: result.count },
    });
    return result.count;
  },

  async importIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    items: Array<Record<string, unknown>>,
  ) {
    await InspectionIssueAccessService.ensurePermission(
      userinfo,
      INSPECTION_ISSUE_PERMISSION_CODES.CREATE,
    );
    let successCount = 0;
    const rowErrors = [];
    const supplierNamesToRefresh: string[] = [];
    let serialSeed = await getNextInspectionIssueSerialNumber();
    const createdBy = String(userinfo.id || '') || undefined;
    for (const [index, item] of items.entries()) {
      try {
        const payload = await buildInspectionIssueUpsertPayload(
          item,
          serialSeed,
          { createdBy },
        );
        if (!payload) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'ncNumber',
              reason: '缺少有效的工单号',
              row: index + 1,
              suggestion: '请填写可关联的工单号',
            }),
          );
          continue;
        }
        serialSeed++;
        try {
          const saved = await prisma.quality_records.upsert(payload);
          await QualityLossIndexService.upsertFromInternal(saved);
          if (saved?.supplierName)
            supplierNamesToRefresh.push(saved.supplierName);
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
    eventBus.emit('inspection_issue.changed', {
      supplierNames: supplierNamesToRefresh,
    });
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

/**
 * Executes `run` up to 3 times for generated identifier conflicts. `run` must
 * regenerate the serial and, when applicable, the NC number on each call.
 */
async function createIssueWithSerialRetry<T>(
  run: () => Promise<T>,
  retryNcNumberConflict: boolean,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (
        attempt >= maxAttempts ||
        (!isSerialNumberConflict(error) &&
          !(retryNcNumberConflict && isNcNumberConflict(error)))
      ) {
        throw error;
      }
    }
  }
}

function isNcNumberConflict(error: unknown): boolean {
  if (!isPrismaUniqueConstraintError(error)) return false;
  const message = String((error as { message?: string })?.message || '');
  const target: unknown = (error as { meta?: { target?: unknown } })?.meta
    ?.target;
  const targetStr = Array.isArray(target)
    ? target.join(',')
    : String(target ?? '');
  return (
    message.includes('nonConformanceNumber') ||
    targetStr.includes('nonConformanceNumber')
  );
}
