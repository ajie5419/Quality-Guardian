import type { Prisma } from '@prisma/client';
import type { AccessScope } from '~/modules/data-scope';

import { QMS_DEFAULT_VALUES } from '@qgs/shared';
import { createScopedRepository } from '~/modules/data-scope';
import { FileStorageService } from '~/modules/file-storage/file-storage.service';
import {
  buildImportRowError,
  buildImportSummary,
  inferImportErrorField,
  toImportErrorMessage,
} from '~/modules/file-storage/import-report';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { QualityLossIndexQueue } from '~/modules/quality-loss';
import { SystemLogService } from '~/modules/system-log/system-log.service';
import { parseRequiredWorkOrderNumber } from '~/modules/work-order/work-order-query';
import { isBusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import {
  createAfterSalesId,
  getNextAfterSalesSerialNumber,
} from './after-sales-id';
import { buildGovernedAfterSalesCreateData } from './after-sales-payload';

export const AfterSalesRouteService = {
  async batchDelete(
    ids: string[],
    userinfo?: {
      id?: number | string;
      userId?: number | string;
      username?: string;
    },
    scope?: AccessScope,
  ) {
    const result = await prisma.$transaction(async (tx) => {
      const txRepo = createScopedRepository('after-sales', tx.after_sales);
      const access = {
        user: {
          id: userinfo?.id ?? userinfo?.userId ?? '',
          username: userinfo?.username,
        },
        scope,
      };
      const existing = await txRepo.findManyAccessible(
        {
          where: { id: { in: ids }, isDeleted: false },
          select: { id: true, supplierBrandId: true },
        },
        access,
      );
      const result = await txRepo.updateAccessible(
        {
          where: { id: { in: ids } },
          data: { isDeleted: true, updatedAt: new Date() },
        },
        access,
      );
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        existing.map((item) => item.supplierBrandId),
        'after-sales.batch-deleted',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        existing.map((item) => ({ source: 'EXTERNAL', sourcePk: item.id })),
        'after-sales.batch-deleted',
      );
      return {
        count: result.count,
        deletedIds: existing.map((item) => item.id),
      };
    });
    await Promise.all(
      result.deletedIds.map((id) =>
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
    client?: Prisma.TransactionClient,
  ) {
    const serialNumber = await getNextAfterSalesSerialNumber(client ?? prisma);
    const createData = await buildGovernedAfterSalesCreateData(body, {
      createdBy: String(userinfo.id || '') || undefined,
      defaultWorkOrderNumber: QMS_DEFAULT_VALUES.UNKNOWN_WORK_ORDER,
      id: createAfterSalesId(),
      serialNumber,
    });
    const createRow = async (tx: Prisma.TransactionClient) => {
      const created = await tx.after_sales.create({ data: createData });
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [created.supplierBrandId],
        'after-sales.created',
      );
      await QualityLossIndexQueue.enqueue(
        tx,
        [{ source: 'EXTERNAL', sourcePk: created.id }],
        'after-sales.created',
      );
      return created;
    };
    const created = client
      ? await createRow(client)
      : await prisma.$transaction(createRow);
    if (!client) {
      await AfterSalesRouteService.applyCreatePostCommit(
        body,
        created,
        userinfo,
      );
    }
    return created;
  },

  /**
   * Post-commit side effects of an after-sales create. Idempotency handlers
   * call this only when the request was NOT replayed, so a network retry never
   * re-registers file references or writes a duplicate audit row.
   */
  async applyCreatePostCommit(
    body: Record<string, unknown>,
    created: { id: string; projectName?: null | string },
    userinfo: { id?: number | string; realName?: string; username?: string },
  ) {
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
  },

  async importItems(
    items: Record<string, unknown>[],
    userinfo?: { id?: number | string; username?: string },
  ) {
    const createdBy = String(userinfo?.id || '') || undefined;
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
        const createData = await buildGovernedAfterSalesCreateData(item, {
          createdBy,
          defaultWorkOrderNumber: woNumber,
          id: createAfterSalesId(),
          classificationMode: 'import',
          identityMode: 'legacy-import',
          serialNumber,
        });
        await prisma.$transaction(async (tx) => {
          const created = await tx.after_sales.create({ data: createData });
          await MetricRefreshQueue.enqueueSupplierScores(
            tx,
            [created.supplierBrandId],
            'after-sales.imported',
          );
          await QualityLossIndexQueue.enqueue(
            tx,
            [{ source: 'EXTERNAL', sourcePk: created.id }],
            'after-sales.imported',
          );
        });
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
    return buildImportSummary({
      rowErrors,
      successCount,
      totalCount: items.length,
    });
  },
};
