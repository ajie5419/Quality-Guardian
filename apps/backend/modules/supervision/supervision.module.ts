import type { ModuleDeclaration } from '~/utils/module-types';

export const supervisionModule: ModuleDeclaration = {
  name: 'supervision',
  menus: [
    {
      key: 'supervision',
      parentPath: '/qms',
      path: '/qms/supervision',
      name: 'QMSSupervision',
      component: 'qms/supervision/index',
      authCode: 'QMS:Supervision:List',
      order: 96,
      type: 'menu',
      meta: {
        icon: 'carbon:location-company',
        orderNo: 96,
        title: '监造管理',
      },
    },
  ],
};
