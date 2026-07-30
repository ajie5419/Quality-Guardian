import type { QualityClassificationScope } from '@qgs/shared';

import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

function getScope(fieldName: string): null | QualityClassificationScope {
  if (fieldName === 'defectClassification') {
    return QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_DEFECT;
  }
  if (fieldName === 'productClassification') {
    return QUALITY_CLASSIFICATION_SCOPE.AFTER_SALES_PRODUCT;
  }
  return null;
}

export const AfterSalesClassificationResolutionService = {
  async resolve(params: {
    auditId: string;
    categoryId: string;
    note: string;
    subcategoryId: string;
  }) {
    return prisma.$transaction(
      async (tx) => {
        const audit = await MasterDataResolutionAuditService.get(
          params.auditId,
          tx,
        );
        const scope =
          audit?.entityType === 'after_sales' && audit.status === 'OPEN'
            ? getScope(audit.fieldName)
            : null;
        if (!audit || !scope) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
            'The unresolved reference is not an open after-sales classification',
            400,
          );
        }
        const selection = await QualityClassificationService.assertSelection(
          scope,
          params.categoryId,
          params.subcategoryId,
          tx,
        );
        const current = await tx.after_sales.findFirst({
          where: { id: audit.entityId, isDeleted: false },
          select: {
            defectCategoryId: true,
            defectSubcategoryId: true,
            defectSubtype: true,
            defectType: true,
            id: true,
            productCategoryId: true,
            productSubcategoryId: true,
            productSubtype: true,
            productType: true,
          },
        });
        if (!current) {
          throw new BusinessError(
            'AFTER_SALES_NOT_FOUND',
            'After-sales record not found',
            404,
          );
        }

        const isDefect = audit.fieldName === 'defectClassification';
        const currentCategoryId = isDefect
          ? current.defectCategoryId
          : current.productCategoryId;
        const currentSubcategoryId = isDefect
          ? current.defectSubcategoryId
          : current.productSubcategoryId;
        if (
          (currentCategoryId && currentCategoryId !== selection.category.id) ||
          (currentSubcategoryId &&
            currentSubcategoryId !== selection.subcategory.id)
        ) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_CHANGED',
            'After-sales classification changed after the audit was created',
            409,
          );
        }

        const currentClassificationWhere = isDefect
          ? {
              defectCategoryId: current.defectCategoryId,
              defectSubcategoryId: current.defectSubcategoryId,
              defectSubtype: current.defectSubtype,
              defectType: current.defectType,
            }
          : {
              productCategoryId: current.productCategoryId,
              productSubcategoryId: current.productSubcategoryId,
              productSubtype: current.productSubtype,
              productType: current.productType,
            };
        const resolvedClassificationData = isDefect
          ? {
              defectCategoryId: selection.category.id,
              defectSubcategoryId: selection.subcategory.id,
              defectSubtype: selection.subcategory.name,
              defectType: selection.category.name,
            }
          : {
              productCategoryId: selection.category.id,
              productSubcategoryId: selection.subcategory.id,
              productSubtype: selection.subcategory.name,
              productType: selection.category.name,
            };
        let affectedCount = 0;
        let afterId: string | undefined;
        let resolvedAuditCount = 0;
        for (;;) {
          const matchingAudits =
            await MasterDataResolutionAuditService.findMatchingOpenBatch(
              {
                afterId,
                entityType: audit.entityType,
                fieldName: audit.fieldName,
                rawId: audit.rawId,
                rawName: audit.rawName,
                take: 500,
              },
              tx,
            );
          if (matchingAudits.length === 0) break;
          afterId = matchingAudits.at(-1)?.id;
          const eligibleRecords = await tx.after_sales.findMany({
            where: {
              ...currentClassificationWhere,
              id: { in: matchingAudits.map((item) => item.entityId) },
              isDeleted: false,
            },
            select: { id: true },
          });
          const eligibleIds = new Set(eligibleRecords.map((item) => item.id));
          const eligibleAudits = matchingAudits.filter((item) =>
            eligibleIds.has(item.entityId),
          );
          if (eligibleAudits.length === 0) continue;
          const updated = await tx.after_sales.updateMany({
            where: {
              ...currentClassificationWhere,
              id: { in: eligibleAudits.map((item) => item.entityId) },
              isDeleted: false,
            },
            data: resolvedClassificationData,
          });
          if (updated.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'After-sales classification changed during resolution',
              409,
            );
          }
          const resolved = await MasterDataResolutionAuditService.resolveMany(
            {
              ids: eligibleAudits.map((item) => item.id),
              note: params.note || 'Resolved from master data governance',
              resolvedId: selection.subcategory.id,
            },
            tx,
          );
          if (resolved.count !== eligibleAudits.length) {
            throw new BusinessError(
              'MASTER_DATA_REFERENCE_CHANGED',
              'After-sales governance references changed during resolution',
              409,
            );
          }
          affectedCount += updated.count;
          resolvedAuditCount += resolved.count;
        }
        if (affectedCount === 0) {
          throw new BusinessError(
            'MASTER_DATA_REFERENCE_CHANGED',
            'After-sales classification changed during resolution',
            409,
          );
        }
        return {
          auditId: audit.id,
          affectedCount,
          entityId: current.id,
          resolvedAuditCount,
          selection,
        };
      },
      { maxWait: 5000, timeout: 60_000 },
    );
  },
};
