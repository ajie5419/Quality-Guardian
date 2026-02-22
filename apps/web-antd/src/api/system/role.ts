import type { PageResult, Role } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

// Re-export for compatibility
export * from '@qgs/shared';

export const getRoleList = (params?: { page?: number; pageSize?: number }) => {
  const { page = 1, pageSize = 20 } = params || {};
  return requestClient.get<PageResult<Role>>(SYSTEM_API.ROLE_LIST, {
    params: { page, pageSize },
  });
};

export const getRolePermissionTree = () => {
  return requestClient.get('/system/role/permission-tree');
};

export const createRole = (data: Record<string, unknown>) => {
  return requestClient.post('/system/role', data);
};

export const updateRole = (id: string, data: Record<string, unknown>) => {
  return requestClient.put(`/system/role/${id}`, data);
};

export const deleteRole = (id: string) => {
  return requestClient.delete(`/system/role/${id}`);
};

export namespace SystemRoleApi {
  export type Role = import('@qgs/shared').Role;
}
