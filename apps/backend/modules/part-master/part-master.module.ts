import type { ModuleDeclaration } from '~/utils/module-types';

export const partMasterModule: ModuleDeclaration = {
  name: 'part-master',
  menus: [
    {
      key: 'system-part-master',
      parentPath: '/system',
      path: '/system/part-master',
      name: 'SystemPartMaster',
      component: 'system/part-master/index',
      authCode: 'System:PartMaster:List',
      order: 9,
      type: 'menu',
      meta: {
        icon: 'carbon:product',
        title: 'Material Master',
      },
      buttons: [
        {
          authCode: 'System:PartMaster:Edit',
          name: 'SystemPartMasterEdit',
          order: 1,
          title: 'Edit Materials',
        },
      ],
    },
  ],
};
