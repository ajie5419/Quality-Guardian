import { requestClient } from '#/api/request';
import type { Dept } from '@qgs/shared';

// Re-export for compatibility
export * from '@qgs/shared';

export const getDeptList = () => {
  return requestClient.get<Dept[]>('/system/dept/list');
};
