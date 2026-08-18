import type { ModuleDeclaration } from '~/utils/module-types';

import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';

export const supervisionModule: ModuleDeclaration = {
  name: 'supervision',
  menus: [
    {
      key: 'supervision',
      parentPath: '/qms',
      path: '/qms/supervision',
      name: 'QMSSupervision',
      component: 'qms/supervision/index',
      authCode: SUPERVISION_PERMISSION_CODES.LIST,
      order: 96,
      type: 'menu',
      meta: {
        icon: 'carbon:location-company',
        orderNo: 96,
        title: '监造管理',
      },
      buttons: [
        {
          authCode: SUPERVISION_PERMISSION_CODES.CREATE,
          name: 'QMSSupervisionCreate',
          order: 1,
          title: '新增',
        },
        {
          authCode: SUPERVISION_PERMISSION_CODES.EDIT,
          name: 'QMSSupervisionEdit',
          order: 2,
          title: '编辑',
        },
        {
          authCode: SUPERVISION_PERMISSION_CODES.DELETE,
          name: 'QMSSupervisionDelete',
          order: 3,
          title: '删除',
        },
      ],
    },
  ],
};
