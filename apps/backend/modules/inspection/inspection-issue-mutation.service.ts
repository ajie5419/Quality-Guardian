import type { UserSession } from '~/utils/jwt-utils';

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
import prisma from '~/utils/prisma';

import {
  buildInspectionIssueCreateData,
  buildInspectionIssueUpdateData,
  buildInspectionIssueUpsertPayload,
  createInspectionIssueId,
  findInspectionForIssue,
  getNextInspectionIssueSerialNumber,
} from './inspection-issue';

type RequestBody = Record<string, unknown>;

async function refreshSupplierScoreSnapshots(names: unknown[]) {
  const supplierNames = names
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (supplierNames.length === 0) return;
  const { SupplierScoreSnapshotService } = await import('~/modules/supplier');
  await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
}

export const InspectionIssueMutationService = {
  async createIssue(userinfo: UserSession, body: RequestBody) {
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
    const serialNumber = await getNextInspectionIssueSerialNumber();
    const newRecord = await prisma.quality_records.create({
      data: await buildInspectionIssueCreateData(body, {
        createdBy: String(userinfo.id || '') || undefined,
        id: newId,
        inspection: linkedInspection,
        inspectorUsername: userinfo.username,
        serialNumber,
      }),
    });
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
    await WelderScoreService.syncFromInspectionIssues();
    await refreshSupplierScoreSnapshots([newRecord.supplierName]);
    return { ...newRecord, ncNumber: newRecord.nonConformanceNumber };
  },

  async updateIssue(
    userinfo: UserSession,
    id: string,
    body: RequestBody,
    existingNcNumber: null | string,
  ) {
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
    await WelderScoreService.syncFromInspectionIssues();
    await refreshSupplierScoreSnapshots([
      current?.supplierName,
      updateData.supplierName,
    ]);
  },

  async batchDeleteIssues(
    event: Parameters<typeof recordBusinessAuditLog>[0],
    userinfo: UserSession,
    ids: string[],
  ) {
    const existing = await prisma.quality_records.findMany({
      where: { id: { in: ids } },
      select: { supplierName: true },
    });
    const result = await prisma.quality_records.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    if (result.count > 0) await WelderScoreService.syncFromInspectionIssues();
    await QualityLossIndexService.softDeleteSourceMany('Internal', ids);
    await refreshSupplierScoreSnapshots(
      existing.map((item) => item.supplierName),
    );
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
        const saved = await prisma.quality_records.upsert(payload);
        await QualityLossIndexService.upsertFromInternal(saved);
        if (saved?.supplierName)
          supplierNamesToRefresh.push(saved.supplierName);
        successCount++;
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
    if (successCount > 0) await WelderScoreService.syncFromInspectionIssues();
    await refreshSupplierScoreSnapshots(supplierNamesToRefresh);
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
