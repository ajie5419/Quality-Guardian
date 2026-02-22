import type { Menu } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export for compatibility
export * from '@qgs/shared';

export const getMenuList = () => {
  return requestClient.get<Menu[]>('/system/menu/list');
};

export const createMenu = (data: Record<string, unknown>) => {
  return requestClient.post('/system/menu', data);
};

export const updateMenu = (id: string, data: Record<string, unknown>) => {
  return requestClient.put(`/system/menu/${id}`, data);
};

export const deleteMenu = (id: string) => {
  return requestClient.delete(`/system/menu/${id}`);
};

export namespace SystemMenuApi {
  export type Menu = import('@qgs/shared').Menu;
}
