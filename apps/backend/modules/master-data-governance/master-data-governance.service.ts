import type { MasterDataResolutionStatus } from '~/modules/supplier-identity';

import {
  getOnlineResolutionDescriptor,
  HistoricalIdentityResolutionService,
} from '~/modules/master-data-identity';
import { MasterDataResolutionAuditService } from '~/modules/supplier-identity';
import { BusinessError } from '~/utils/business-error';
import { MasterDataGovernanceKernel } from '~/utils/canonical-master-data';

import { masterDataGovernanceResolutionSchema } from './master-data-governance.schema';

function assertCanonicalIdSelection(canonicalIds: string[], multiple: boolean) {
  if (!multiple && canonicalIds.length !== 1) {
    throw new BusinessError(
      'MASTER_DATA_SINGLE_SELECTION_REQUIRED',
      'This governance field requires exactly one selection',
      400,
    );
  }
  if (multiple) {
    throw new BusinessError(
      'MASTER_DATA_MULTI_SELECTION_NOT_SUPPORTED',
      'Multiple identity decisions must be submitted as separate references',
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
    const result = await MasterDataResolutionAuditService.list({
      ...params,
      status: params.status || 'OPEN',
    });
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        resolution: getOnlineResolutionDescriptor(
          item.entityType,
          item.fieldName,
        ),
      })),
    };
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
    const descriptor = getOnlineResolutionDescriptor(
      audit.entityType,
      audit.fieldName,
    );
    if (!descriptor || descriptor.kind !== 'IDENTITY') {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
        'This reference does not provide canonical options',
        400,
      );
    }
    return {
      items: await MasterDataGovernanceKernel.listCanonicalOptions({
        configKey: descriptor.configKey,
        keyword,
      }),
      multiple: descriptor.multiple,
    };
  },

  async resolveRequest(auditId: string, input: unknown, actorId: string) {
    const body = masterDataGovernanceResolutionSchema.parse(input);
    return this.resolve({ auditId, actorId, ...body });
  },

  async resolve(
    params:
      | {
          actorId?: string;
          auditId: string;
          canonicalIds: string[];
          note: string;
          resolutionType: 'IDENTITY';
        }
      | {
          actorId?: string;
          auditId: string;
          categoryId: string;
          note: string;
          resolutionType: 'CLASSIFICATION';
          subcategoryId: string;
        }
      | {
          actorId?: string;
          auditId: string;
          departmentId: string;
          note: string;
          resolutionType: 'DEPARTMENT';
        }
      | {
          actorId?: string;
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
    const descriptor = getOnlineResolutionDescriptor(
      audit.entityType,
      audit.fieldName,
    );
    if (descriptor?.kind === 'IDENTITY') {
      let canonicalId: null | string = null;
      switch (params.resolutionType) {
        case 'CLASSIFICATION': {
          break;
        }
        case 'DEPARTMENT': {
          canonicalId = params.departmentId;
          break;
        }
        case 'IDENTITY': {
          canonicalId = assertCanonicalIdSelection(
            params.canonicalIds,
            descriptor.multiple,
          );
          break;
        }
        case 'PROCESS': {
          canonicalId = params.processId;
          break;
        }
      }
      if (!canonicalId) {
        throw new BusinessError(
          'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
          'The selected resolution type does not match this reference',
          400,
        );
      }
      return HistoricalIdentityResolutionService.resolveManualWorkItem({
        actorId: params.actorId || '',
        auditId: params.auditId,
        canonicalId,
        note: params.note,
      });
    }
    if (
      descriptor?.kind !== 'CLASSIFICATION' ||
      params.resolutionType !== 'CLASSIFICATION'
    ) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_NOT_SUPPORTED',
        'The selected resolution type does not match this reference',
        400,
      );
    }
    return HistoricalIdentityResolutionService.resolveManualWorkItem({
      actorId: params.actorId || '',
      auditId: params.auditId,
      canonicalId: params.subcategoryId,
      note: params.note,
    });
  },
};
