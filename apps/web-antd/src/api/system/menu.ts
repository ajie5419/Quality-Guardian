import { requestClient } from '#/api/request';

export namespace SystemMenuApi {
  export interface Menu {
    id: string;
    pid: string;
    path: string;
    name: string;
    component: string;
    redirect?: string;
    meta: {
      hideMenu?: boolean;
      icon?: string;
      orderNo?: number;
      title: string;
    };
    children?: Menu[];
  }
}

export const getMenuList = () => {
  return requestClient.get<SystemMenuApi.Menu[]>('/system/menu/list');
};
