import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { parseRequiredWorkOrderNumber } from '~/modules/work-order/work-order-query';
import prisma from '~/utils/prisma';

import {
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
} from './after-sales-id';
import { buildGovernedAfterSalesCreateData } from './after-sales-payload';

async function refreshSupplierScoreSnapshots(names: unknown[]) {
  const supplierNames = names
    .map((name) => String(name || '').trim())
    .filter(Boolean);
  if (supplierNames.length === 0) return;
  const { SupplierScoreSnapshotService } = await import('~/modules/supplier');
  await SupplierScoreSnapshotService.refreshBySupplierNames(supplierNames);
}

export const AfterSalesRouteService = {
  async batchDelete(ids: string[]) {
    const existing = await prisma.after_sales.findMany({
      where: { id: { in: ids } },
      select: { supplierBrand: true },
    });
    const result = await prisma.after_sales.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    await Promise.all(
      ids.map((id) =>
        FileStorageService.softDeleteReferences({
          bizId: id,
          bizType: 'after_sales',
        }),
      ),
    );
    await refreshSupplierScoreSnapshots(
      existing.map((item) => item.supplierBrand),
    );
    return result.count;
  },

  async create(
    body: Record<string, unknown>,
    userinfo: { id?: number | string; realName?: string; username?: string },
  ) {
    const serialNumber = await getNextAfterSalesSerialNumber();
    const created = await prisma.after_sales.create({
      data: await buildGovernedAfterSalesCreateData(body, {
        createdBy: String(userinfo.id || '') || undefined,
        defaultWorkOrderNumber: QMS_DEFAULT_VALUES.UNKNOWN_WORK_ORDER,
        id: createAfterSalesId(),
        serialNumber,
      }),
    });
    await FileStorageService.registerReferencesFromAttachments({
      attachments: body.photos,
      bizId: String(created.id),
      bizType: 'after_sales',
      fieldName: 'photos',
    });
    await SystemLogService.auditLog('after-sales', 'create', {
      userId: String(userinfo.id || ''),
      targetId: String(created.id),
      detailsVariables: { id: created.id, projectName: created.projectName },
    });
    await refreshSupplierScoreSnapshots([created.supplierBrand]);
    return created;
  },

  async importItems(
    items: Record<string, unknown>[],
    userinfo?: { id?: number | string; username?: string },
  ) {
    const createdBy = String(userinfo?.id || '') || undefined;
    let successCount = 0;
    const rowErrors = [];
    const supplierNamesToRefresh: string[] = [];
    let serialSeed = await getNextAfterSalesSerialNumber();
    for (const [index, item] of items.entries()) {
      try {
        const woNumber = parseRequiredWorkOrderNumber(item.workOrderNumber);
        if (!woNumber) {
          rowErrors.push(
            buildImportRowError({
              field: 'workOrderNumber',
              item,
              keyField: 'workOrderNumber',
              reason: '工单号为空',
              row: index + 1,
              suggestion: '请填写有效工单号',
            }),
          );
          continue;
        }
        const serialNumber = serialSeed++;
        const created = await prisma.after_sales.create({
          data: await buildGovernedAfterSalesCreateData(item, {
            createdBy,
            defaultWorkOrderNumber: woNumber,
            id: createAfterSalesId(),
            serialNumber,
          }),
        });
        if (created.supplierBrand) {
          supplierNamesToRefresh.push(created.supplierBrand);
        }
        successCount++;
      } catch (error) {
        const message = toImportErrorMessage(error);
        rowErrors.push(
          buildImportRowError({
            field: inferImportErrorField(message),
            item,
            keyField: 'workOrderNumber',
            reason: message,
            row: index + 1,
          }),
        );
      }
    }
    await refreshSupplierScoreSnapshots(supplierNamesToRefresh);
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
};
