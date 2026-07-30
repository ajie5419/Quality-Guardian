import type { MasterDataResolutionStatus } from '~/modules/supplier-identity';

import { AfterSalesClassificationResolutionService } from '~/modules/after-sales';
import {
  InspectionClassificationResolutionService,
  InspectionDepartmentResolutionService,
  InspectionIdentityResolutionService,
  InspectionProcessResolutionService,
} from '~/modules/inspection';
import { PlanningBomGovernanceResolutionService } from '~/modules/planning';
import {
  MasterDataResolutionAuditService,
  SupplierIdentityGovernanceResolutionService,
} from '~/modules/supplier-identity';
import { WorkOrderGovernanceResolutionService } from '~/modules/work-order';
import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { masterDataGovernanceResolutionSchema } from './master-data-governance.schema';

const IDENTITY_FIELDS = {
  inspections: {
    incomingTypeId: 'incomingType',
    materialNameId: 'materialName',
    partId: 'partName',
    processId: 'processName',
    projectId: 'projectName',
    supplierId: 'supplierName',
    teamId: 'team',
  },
  project_boms: { partId: 'partName', requiredProcessIds: 'processName' },
  supplier_identity_links: { supplierId: 'supplierName' },
  work_order_requirements: {
    partId: 'partName',
    processId: 'processName',
    requirementId: 'requirementName',
    responsibleTeamId: 'responsibleTeam',
  },
  work_orders: {
    customerNameId: 'customerName',
    divisionId: 'division',
    projectId: 'projectName',
  },
} as const;

function identityConfig(entityType: string, fieldName: string) {
  const fields = IDENTITY_FIELDS[entityType as keyof typeof IDENTITY_FIELDS];
  if (!fields || !Object.prototype.hasOwnProperty.call(fields, fieldName)) {
    return null;
  }
  return fields[fieldName as keyof typeof fields];
}

function assertSingleId(canonicalIds: string[]) {
  if (canonicalIds.length !== 1) {
    throw new BusinessError(
      'MASTER_DATA_SINGLE_SELECTION_REQUIRED',
      'This governance field requires exactly one selection',
      400,
    );
  }
  return canonicalIds[0];
}

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

  async listOptions(auditId: string, keyword = '') {
    const audit = await MasterDataResolutionAuditService.get(auditId);
    if (!audit || audit.status !== 'OPEN') {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_FOUND',
        'Open unresolved reference not found',
        404,
      );
    }
    const configKey = identityConfig(audit.entityType, audit.fieldName);
    if (!configKey) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
        'This reference does not provide canonical options',
        400,
      );
    }
    return {
      items: await MasterDataGovernanceKernel.listCanonicalOptions({
        configKey,
        keyword,
      }),
      multiple:
        audit.entityType === 'project_boms' &&
        audit.fieldName === 'requiredProcessIds',
    };
  },

  async resolveRequest(auditId: string, input: unknown) {
    const body = masterDataGovernanceResolutionSchema.parse(input);
    return this.resolve({ auditId, ...body });
  },

  async resolve(
    params:
      | {
          auditId: string;
          canonicalIds: string[];
          note: string;
          resolutionType: 'IDENTITY';
        }
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
    if (params.resolutionType === 'IDENTITY') {
      if (!identityConfig(audit.entityType, audit.fieldName)) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
          'This identity reference does not support online resolution',
          400,
        );
      }
      if (audit.entityType === 'inspections') {
        return InspectionIdentityResolutionService.resolve({
          ...params,
          canonicalId: assertSingleId(params.canonicalIds),
        });
      }
      if (audit.entityType === 'project_boms') {
        return audit.fieldName === 'requiredProcessIds'
          ? PlanningBomGovernanceResolutionService.resolveRequiredProcesses({
              ...params,
              processIds: params.canonicalIds,
            })
          : PlanningBomGovernanceResolutionService.resolvePart({
              ...params,
              partId: assertSingleId(params.canonicalIds),
            });
      }
      if (audit.entityType === 'supplier_identity_links') {
        return SupplierIdentityGovernanceResolutionService.resolve({
          ...params,
          supplierId: assertSingleId(params.canonicalIds),
        });
      }
      return WorkOrderGovernanceResolutionService.resolve({
        ...params,
        resolvedId: assertSingleId(params.canonicalIds),
      });
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
