import type { PageResult, Role } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

// Re-export for compatibility
export * from '@qgs/shared';

export const getRoleList = (params?: { page?: number; pageSize?: number }) => {
  const { page = 1, pageSize = 20 } = params || {};
  return requestClient.get<PageResult<Role>>(
    `${SYSTEM_API.ROLE_LIST}?page=${page}&pageSize=${pageSize}`,
  );
};

export namespace SystemRoleApi {
  export type Role = import('@qgs/shared').Role;
}
