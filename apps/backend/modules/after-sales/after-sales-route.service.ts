import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { QualityLossIndexService } from '~/modules/quality-loss/quality-loss-index.service';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { parseRequiredWorkOrderNumber } from '~/modules/work-order/work-order-query';
import { isBusinessError } from '~/utils/business-error';
import { eventBus } from '~/utils/event-bus';
import prisma from '~/utils/prisma';

import {
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
} from './after-sales-id';
import { buildGovernedAfterSalesCreateData } from './after-sales-payload';

export const AfterSalesRouteService = {
  async batchDelete(ids: string[]) {
    const existing = await prisma.after_sales.findMany({
      where: { id: { in: ids } },
      select: { supplierBrand: true, supplierBrandId: true },
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
    await QualityLossIndexService.softDeleteSourceMany('External', ids);
    eventBus.emit('after_sales.changed', {
      supplierBrands: existing.map((item) => item.supplierBrand),
      supplierIds: existing.map((item) => item.supplierBrandId),
    });
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
    await QualityLossIndexService.upsertFromAfterSales(created);
    eventBus.emit('after_sales.changed', {
      supplierBrands: [created.supplierBrand],
      supplierIds: [created.supplierBrandId],
    });
    return created;
  },

  async importItems(
    items: Record<string, unknown>[],
    userinfo?: { id?: number | string; username?: string },
  ) {
    const createdBy = String(userinfo?.id || '') || undefined;
    let successCount = 0;
    const rowErrors = [];
    const supplierIdsToRefresh: Array<null | string | undefined> = [];
    const supplierNamesToRefresh: Array<null | string | undefined> = [];
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
            classificationMode: 'import',
            identityMode: 'legacy-import',
            serialNumber,
          }),
        });
        await QualityLossIndexService.upsertFromAfterSales(created);
        if (created.supplierBrand) {
          supplierNamesToRefresh.push(created.supplierBrand);
        }
        if (created.supplierBrandId) {
          supplierIdsToRefresh.push(created.supplierBrandId);
        }
        successCount++;
      } catch (error) {
        const message = toImportErrorMessage(error);
        const classificationError =
          isBusinessError(error) &&
          (error.code.startsWith('QUALITY_CLASSIFICATION_') ||
            error.code === 'AFTER_SALES_CLASSIFICATION_REQUIRED');
        rowErrors.push(
          buildImportRowError({
            field: classificationError
              ? 'qualityClassification'
              : inferImportErrorField(message),
            item,
            keyField: 'workOrderNumber',
            reason: message,
            row: index + 1,
            suggestion: classificationError
              ? 'Provide an active category and matching subcategory for both product and defect classifications'
              : undefined,
          }),
        );
      }
    }
    eventBus.emit('after_sales.changed', {
      supplierBrands: supplierNamesToRefresh,
      supplierIds: supplierIdsToRefresh,
    });
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
};
