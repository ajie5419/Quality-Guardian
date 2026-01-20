import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

import { CORE_API } from './constants';

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  return requestClient.get<UserInfo>(CORE_API.USER_INFO);
}
