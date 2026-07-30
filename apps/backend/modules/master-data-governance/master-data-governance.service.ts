import type { MasterDataResolutionStatus } from '~/modules/supplier-identity';

import { AfterSalesClassificationResolutionService } from '~/modules/after-sales';
import {
  InspectionClassificationResolutionService,
  InspectionDepartmentResolutionService,
} from '~/modules/inspection';
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

  async resolve(
    params:
      | {
          auditId: string;
          categoryId: string;
          note: string;
          resolutionType: 'CLASSIFICATION';
          subcategoryId: string;
        }
      | {
          auditId: string;
          departmentId: string;
          note: string;
          resolutionType: 'DEPARTMENT';
        },
  ) {
    const audit = await MasterDataResolutionAuditService.get(params.auditId);
    if (!audit) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_FOUND',
        'Unresolved reference not found',
        404,
      );
    }
    if (
      audit.entityType === 'quality_records' &&
      audit.fieldName === 'responsibleDepartmentId' &&
      params.resolutionType === 'DEPARTMENT'
    ) {
      return InspectionDepartmentResolutionService.resolve(params);
    }
    if (params.resolutionType !== 'CLASSIFICATION') {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
        'The selected resolution type does not match this reference',
        400,
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
