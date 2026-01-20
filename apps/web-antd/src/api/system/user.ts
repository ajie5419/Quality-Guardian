import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

export namespace SystemUserApi {
  export interface User {
    id: string;
    username: string;
    realName: string;
    email?: string;
    phone?: string;
    deptId?: string;
    deptName?: string;
    roleIds?: string[];
    roles?: string[];
    status: number;
    createTime: string;
    remark?: string;
  }

  export interface PageResult<T> {
    items: T[];
    total: number;
  }
}

export const getUserList = (params?: { page?: number; pageSize?: number }) => {
  const { page = 1, pageSize = 20 } = params || {};
  return requestClient.get<SystemUserApi.PageResult<SystemUserApi.User>>(
    `${SYSTEM_API.USER_LIST}?page=${page}&pageSize=${pageSize}`,
  );
};

export const createUser = (data: Partial<SystemUserApi.User>) => {
  return requestClient.post<SystemUserApi.User>(SYSTEM_API.USER, data);
};

export const updateUser = (id: string, data: Partial<SystemUserApi.User>) => {
  return requestClient.put(`${SYSTEM_API.USER}/${id}`, data);
};

export const deleteUser = (id: string) => {
  return requestClient.delete(`${SYSTEM_API.USER}/${id}`);
};
