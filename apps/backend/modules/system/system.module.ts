import type { ModuleDeclaration } from '~/utils/module-types';

export const systemModule: ModuleDeclaration = {
  name: 'system',
  menus: [
    {
      key: 'system-architecture',
      parentPath: '/system',
      path: '/system/architecture',
      name: 'SystemArchitecture',
      component: '_dev/architecture/index',
      authCode: 'System:Architecture:View',
      order: 9000,
      type: 'menu',
      meta: {
        icon: 'carbon:flow-connection',
        orderNo: 9000,
        title: '架构总览',
      },
    },
  ],
};
