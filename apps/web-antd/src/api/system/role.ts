import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

export namespace SystemRoleApi {
  export interface Role {
    id: string;
    name: string;
    value: string;
    status: number;
    createTime: string;
    remark?: string;
    permissions?: string[];
  }

  export interface PageResult<T> {
    items: T[];
    total: number;
  }
}

export const getRoleList = (params?: { page?: number; pageSize?: number }) => {
  const { page = 1, pageSize = 20 } = params || {};
  return requestClient.get<SystemRoleApi.PageResult<SystemRoleApi.Role>>(
    `${SYSTEM_API.ROLE_LIST}?page=${page}&pageSize=${pageSize}`,
  );
};
