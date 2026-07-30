import type { MasterDataResolutionStatus } from '~/modules/supplier-identity';

import { AfterSalesClassificationResolutionService } from '~/modules/after-sales';
import {
  InspectionClassificationResolutionService,
  InspectionDepartmentResolutionService,
  InspectionProcessResolutionService,
} from '~/modules/inspection';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';

import { masterDataGovernanceResolutionSchema } from './master-data-governance.schema';

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

  async resolveRequest(auditId: string, input: unknown) {
    const body = masterDataGovernanceResolutionSchema.parse(input);
    return this.resolve({ auditId, ...body });
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
        }
      | {
          auditId: string;
          note: string;
          processId: string;
          resolutionType: 'PROCESS';
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
    if (
      audit.entityType === 'qms_inspection_requests' &&
      audit.fieldName === 'processId' &&
      params.resolutionType === 'PROCESS'
    ) {
      return InspectionProcessResolutionService.resolve(params);
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
