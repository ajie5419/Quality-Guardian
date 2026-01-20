import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

import { CORE_API } from './constants';

/**
 * 获取用户所有菜单
 */
export async function getAllMenusApi() {
  return requestClient.get<RouteRecordStringComponent[]>(CORE_API.MENU_ALL);
}
