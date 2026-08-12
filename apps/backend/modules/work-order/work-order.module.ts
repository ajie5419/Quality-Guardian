import type { ModuleDeclaration } from '~/utils/module-types';

import { PERMISSION_CODES } from '@qgs/shared';

export const workOrderModule: ModuleDeclaration = {
  name: 'work-order',
  menus: [
    {
      key: 'work-order',
      parentPath: '/qms',
      path: '/qms/work-order',
      name: 'QMSWorkOrder',
      component: 'qms/work-order/index',
      authCode: PERMISSION_CODES.QMS.WORK_ORDER.LIST,
      order: 3,
      type: 'menu',
      meta: {
        title: '工单管理',
        icon: 'carbon:list-boxes',
      },
      buttons: [
        {
          authCode: PERMISSION_CODES.QMS.WORK_ORDER.CONFIRM,
          name: 'QMSWorkOrderConfirm',
          order: 5,
          title: '确认/撤销',
        },
      ],
    },
  ],
  dataScope: {
    deptFields: ['division'],
    selfFields: [],
    selfFallsBackToDept: true,
  },
};
