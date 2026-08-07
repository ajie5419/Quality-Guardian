import { requestClient } from '#/api/request';

export namespace MasterDataGovernanceApi {
  export type Status = 'IGNORED' | 'OPEN' | 'RESOLVED';
  export type Resolution =
    | {
        configKey: string;
        kind: 'IDENTITY';
        multiple: boolean;
      }
    | {
        kind: 'CLASSIFICATION';
        scope:
          | 'AFTER_SALES_DEFECT'
          | 'AFTER_SALES_PRODUCT'
          | 'INSPECTION_ISSUE_DEFECT';
      };

  export interface Reference {
    entityId: string;
    entityType: string;
    evidence: null | Record<string, unknown>;
    fieldName: string;
    firstSeenAt: string;
    id: string;
    lastSeenAt: string;
    rawId: null | string;
    rawName: null | string;
    reason: string;
    resolution: null | Resolution;
    resolutionNote: null | string;
    resolvedAt: null | string;
    resolvedId: null | string;
    status: Status;
  }

  export interface PageResult {
    items: Reference[];
    total: number;
  }

  export interface Query {
    entityType?: string;
    fieldName?: string;
    page: number;
    pageSize: number;
    status: Status;
  }
}

const BASE_URL = '/system/master-data-governance';

export function getMasterDataReferencesApi(
  params: MasterDataGovernanceApi.Query,
) {
  return requestClient.get<MasterDataGovernanceApi.PageResult>(BASE_URL, {
    params,
  });
}

export function getMasterDataReferenceOptionsApi(id: string, keyword = '') {
  return requestClient.get<{
    items: Array<{ id: string; name: string }>;
    multiple: boolean;
  }>(`${BASE_URL}/${id}/options`, { params: { keyword } });
}

export function resolveMasterDataReferenceApi(
  id: string,
  data:
    | {
        canonicalIds: string[];
        note: string;
        resolutionType: 'IDENTITY';
      }
    | {
        categoryId: string;
        note: string;
        resolutionType: 'CLASSIFICATION';
        subcategoryId: string;
      }
    | {
        departmentId: string;
        note: string;
        resolutionType: 'DEPARTMENT';
      }
    | {
        note: string;
        processId: string;
        resolutionType: 'PROCESS';
      },
) {
  return requestClient.put<{
    decision: { id: string };
    projection: { id: string };
    resolvedAuditCount: number;
  }>(`${BASE_URL}/${id}`, data);
}
