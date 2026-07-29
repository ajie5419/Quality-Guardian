import { QUALITY_CLASSIFICATION_SCOPE } from '@qgs/shared';
import { QualityClassificationService } from '~/modules/quality-classification';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

function assertSupportedAudit(audit: {
  entityType: string;
  fieldName: string;
  status: string;
}) {
  if (
    audit.status !== 'OPEN' ||
    audit.entityType !== 'quality_records' ||
    audit.fieldName !== 'defectClassification'
  ) {
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'The unresolved reference is not an open inspection classification',
      400,
    );
  }
}

export const InspectionClassificationResolutionService = {
  async resolve(params: {
    auditId: string;
    categoryId: string;
    note: string;
    subcategoryId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const audit = await MasterDataResolutionAuditService.get(
        params.auditId,
        tx,
      );
      if (!audit) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_FOUND',
          'Unresolved reference not found',
          404,
        );
      }
      assertSupportedAudit(audit);
      const selection = await QualityClassificationService.assertSelection(
        QUALITY_CLASSIFICATION_SCOPE.INSPECTION_ISSUE_DEFECT,
        params.categoryId,
        params.subcategoryId,
        tx,
      );

      const current = await tx.quality_records.findFirst({
        where: { id: audit.entityId, isDeleted: false },
        select: {
          defectCategoryId: true,
          defectSubcategoryId: true,
          id: true,
        },
      });
      if (!current) {
        throw new BusinessError(
          'INSPECTION_ISSUE_NOT_FOUND',
          'Inspection issue not found',
          404,
        );
      }
      if (
        (current.defectCategoryId &&
          current.defectCategoryId !== selection.category.id) ||
        (current.defectSubcategoryId &&
          current.defectSubcategoryId !== selection.subcategory.id)
      ) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_CHANGED',
          'Inspection classification changed after the audit was created',
          409,
        );
      }

      const update = await tx.quality_records.updateMany({
        where: {
          defectCategoryId: current.defectCategoryId,
          defectSubcategoryId: current.defectSubcategoryId,
          id: current.id,
          isDeleted: false,
        },
        data: {
          defectCategoryId: selection.category.id,
          defectSubcategoryId: selection.subcategory.id,
          defectSubtype: selection.subcategory.name,
          defectType: selection.category.name,
        },
      });
      if (update.count !== 1) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_CHANGED',
          'Inspection classification changed during resolution',
          409,
        );
      }
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
