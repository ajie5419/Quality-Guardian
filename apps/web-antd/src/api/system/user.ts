import { requestClient } from '#/api/request';
import { SYSTEM_API } from './constants';
import type { PageResult, User } from '@qgs/shared';

// Re-export for compatibility
export * from '@qgs/shared';

export const getUserList = (params?: { page?: number; pageSize?: number }) => {
  const { page = 1, pageSize = 20 } = params || {};
  return requestClient.get<PageResult<User>>(
    `${SYSTEM_API.USER_LIST}?page=${page}&pageSize=${pageSize}`,
  );
};

export const createUser = (data: Partial<User>) => {
  return requestClient.post<User>(SYSTEM_API.USER, data);
};

export const updateUser = (id: string, data: Partial<User>) => {
  return requestClient.put(`${SYSTEM_API.USER}/${id}`, data);
};

export const deleteUser = (id: string) => {
  return requestClient.delete(`${SYSTEM_API.USER}/${id}`);
};
