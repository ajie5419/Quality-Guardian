import { requestClient } from '#/api/request';

export namespace MasterDataGovernanceApi {
  export type Status = 'IGNORED' | 'OPEN' | 'RESOLVED';

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

export function resolveMasterDataReferenceApi(
  id: string,
  data: {
    categoryId: string;
    note: string;
    subcategoryId: string;
  },
) {
  return requestClient.put(`${BASE_URL}/${id}`, data);
}
