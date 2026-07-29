import type { MasterDataResolutionStatus } from '~/modules/supplier-identity';

import { AfterSalesClassificationResolutionService } from '~/modules/after-sales';
import { InspectionClassificationResolutionService } from '~/modules/inspection';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

export const MasterDataGovernanceService = {
  async list(params: {
    entityType?: string;
    fieldName?: string;
    page?: number;
    pageSize?: number;
    status?: MasterDataResolutionStatus;
  }) {
    return MasterDataResolutionAuditService.list({
      ...params,
      status: params.status || 'OPEN',
    });
  },

  async resolveClassification(params: {
    auditId: string;
    categoryId: string;
    note: string;
    subcategoryId: string;
  }) {
    const audit = await MasterDataResolutionAuditService.get(params.auditId);
    if (!audit) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_FOUND',
        'Unresolved reference not found',
        404,
      );
    }
    if (audit.entityType === 'quality_records') {
      return InspectionClassificationResolutionService.resolve(params);
    }
    if (audit.entityType === 'after_sales') {
      return AfterSalesClassificationResolutionService.resolve(params);
    }
    throw new BusinessError(
      'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
      'This reference type does not support online resolution yet',
      400,
    );
  },
};
