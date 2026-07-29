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
    const initialAudit = await MasterDataResolutionAuditService.get(
      params.auditId,
    );
    const scope =
      initialAudit?.entityType === 'after_sales' &&
      initialAudit.status === 'OPEN'
        ? getScope(initialAudit.fieldName)
        : null;
    if (!initialAudit || !scope) {
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
    );

    return prisma.$transaction(async (tx) => {
      const audit = await MasterDataResolutionAuditService.get(
        params.auditId,
        tx,
      );
      if (
        !audit ||
        audit.status !== 'OPEN' ||
        audit.entityType !== 'after_sales' ||
        audit.fieldName !== initialAudit.fieldName
      ) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_CHANGED',
          'The unresolved reference was already handled or changed',
          409,
        );
      }
      const current = await tx.after_sales.findFirst({
        where: { id: audit.entityId, isDeleted: false },
        select: {
          defectCategoryId: true,
          defectSubcategoryId: true,
          id: true,
          productCategoryId: true,
          productSubcategoryId: true,
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

      await tx.after_sales.update({
        where: { id: current.id },
        data: isDefect
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
            },
      });
      await MasterDataResolutionAuditService.resolve(
        {
          id: audit.id,
          note: params.note || 'Resolved from master data governance',
          resolvedId: selection.subcategory.id,
        },
        tx,
      );
      return {
        auditId: audit.id,
        entityId: current.id,
        selection,
      };
    });
  },
};
