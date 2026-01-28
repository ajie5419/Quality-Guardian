import type { Dept } from '@qgs/shared';

import { requestClient } from '#/api/request';

// Re-export for compatibility
export * from '@qgs/shared';

export const getDeptList = () => {
  return requestClient.get<Dept[]>('/system/dept/list');
};

export namespace SystemDeptApi {
  export type Dept = import('@qgs/shared').Dept;
}
