import type { PageResult, User as SharedUser } from '@qgs/shared';

import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

// Re-export for compatibility

export interface SystemUser extends SharedUser {
  wechatWorkId?: null | string;
}

export const getUserList = (params?: {
  page?: number;
  pageSize?: number;
  roleName?: string;
  status?: number;
}) => {
  const { page = 1, pageSize = 20, roleName, status } = params || {};
  return requestClient.get<PageResult<SystemUser>>(SYSTEM_API.USER_LIST, {
    params: { page, pageSize, roleName, status },
  });
};

export const createUser = (data: Partial<SystemUser>) => {
  return requestClient.post<SystemUser>(SYSTEM_API.USER, data);
};

export const updateUser = (id: string, data: Partial<SystemUser>) => {
  return requestClient.put(`${SYSTEM_API.USER}/${id}`, data);
};

export const deleteUser = (id: string) => {
  return requestClient.delete(`${SYSTEM_API.USER}/${id}`);
};

export const resetPassword = (id: string) => {
  return requestClient.post(`${SYSTEM_API.USER}/${id}/reset-password`);
};

export namespace SystemUserApi {
  export type User = SystemUser;
  export type PageResult<T> = import('@qgs/shared').PageResult<T>;
}
