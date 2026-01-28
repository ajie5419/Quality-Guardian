import type { Menu } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export for compatibility
export * from '@qgs/shared';

export const getMenuList = () => {
  return requestClient.get<Menu[]>('/system/menu/list');
};

export namespace SystemMenuApi {
  export type Menu = import('@qgs/shared').Menu;
}
