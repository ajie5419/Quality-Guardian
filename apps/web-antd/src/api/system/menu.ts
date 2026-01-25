import { requestClient } from '#/api/request';
import type { Menu } from '@qgs/shared';

// Re-export for compatibility
export * from '@qgs/shared';

export const getMenuList = () => {
  return requestClient.get<Menu[]>('/system/menu/list');
};
