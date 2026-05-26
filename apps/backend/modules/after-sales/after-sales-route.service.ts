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

export const AfterSalesRouteService = {
  async batchDelete(ids: string[]) {
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
    return result.count;
  },

  async create(
    body: Record<string, unknown>,
    userinfo: { id?: number | string; realName?: string; username?: string },
  ) {
    const serialNumber = await getNextAfterSalesSerialNumber();
    const created = await prisma.after_sales.create({
      data: await buildGovernedAfterSalesCreateData(body, {
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
    return created;
  },

  async importItems(items: Record<string, unknown>[]) {
    let successCount = 0;
    const rowErrors = [];
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
        await prisma.after_sales.create({
          data: await buildGovernedAfterSalesCreateData(item, {
            defaultWorkOrderNumber: woNumber,
            id: createAfterSalesId(),
            serialNumber,
          }),
        });
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
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
};
