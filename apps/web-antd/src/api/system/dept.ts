import type { Dept } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export for compatibility
export * from '@qgs/shared';

export const getDeptList = () => {
  return requestClient.get<Dept[]>('/system/dept/list');
};

export const createDept = (data: Partial<Dept> & Record<string, unknown>) => {
  return requestClient.post('/system/dept', data);
};

export const updateDept = (
  id: string,
  data: Partial<Dept> & Record<string, unknown>,
) => {
  return requestClient.put(`/system/dept/${id}`, data);
};

export const deleteDept = (id: string) => {
  return requestClient.delete(`/system/dept/${id}`);
};

export namespace SystemDeptApi {
  export type Dept = import('@qgs/shared').Dept;
}
