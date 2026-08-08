import { requestClient } from '#/api/request';

export namespace SupplierIdentityApi {
  export interface Link {
    createdAt: string;
    id: string;
    identityId: string;
    identityNameSnapshot: string;
    identityType: 'TEAM';
    supplier: {
      id: string;
      isDeleted: boolean;
      name: string;
    };
    supplierId: string;
    updatedAt: string;
  }

  export interface LinkListResponse {
    items: Link[];
    total: number;
  }

  export interface ManagementOptions {
    suppliers: Array<{ label: string; value: string }>;
    teams: Array<{ label: string; value: string }>;
  }

  export interface MutationPayload {
    supplierId: string;
    teamId: string;
  }
}

const BASE_URL = '/qms/supplier-identity-links';

export function getSupplierIdentityLinksApi(params: {
  page: number;
  pageSize: number;
}) {
  return requestClient.get<SupplierIdentityApi.LinkListResponse>(BASE_URL, {
    params,
  });
}

export function createSupplierIdentityLinkApi(
  data: SupplierIdentityApi.MutationPayload,
) {
  return requestClient.post<SupplierIdentityApi.Link>(BASE_URL, data);
}

export function getSupplierIdentityManagementOptionsApi(params?: {
  keyword?: string;
  take?: number;
}) {
  return requestClient.get<SupplierIdentityApi.ManagementOptions>(
    `${BASE_URL}/options`,
    { params },
  );
}

export function updateSupplierIdentityLinkApi(
  id: string,
  data: SupplierIdentityApi.MutationPayload,
) {
  return requestClient.put<SupplierIdentityApi.Link>(`${BASE_URL}/${id}`, data);
}

export function deleteSupplierIdentityLinkApi(id: string) {
  return requestClient.delete(`${BASE_URL}/${id}`);
}
