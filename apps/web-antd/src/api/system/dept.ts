import { requestClient } from '#/api/request';

import { SYSTEM_API } from './constants';

export namespace SystemDeptApi {
  export interface Dept {
    id: string;
    pid: string;
    name: string;
    status: number;
    createTime: string;
    remark?: string;
    children?: Dept[];
  }
}

export const getDeptList = () => {
  return requestClient.get<SystemDeptApi.Dept[]>('/system/dept/list');
};
