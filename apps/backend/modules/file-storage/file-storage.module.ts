import type { ModuleDeclaration } from '~/utils/module-types';

export const fileStorageModule: ModuleDeclaration = {
  name: 'file-storage',
  menus: [
    {
      key: 'file-center',
      parentPath: '/qms',
      path: '/qms/file-center',
      name: 'QMSFileCenter',
      component: 'qms/file-center/index',
      authCode: 'QMS:FileCenter:List',
      order: 94,
      type: 'menu',
      meta: {
        icon: 'carbon:document-attachment',
        orderNo: 94,
        title: '文件中心',
      },
      buttons: [
        {
          authCode: 'QMS:FileCenter:Delete',
          name: 'QMSFileCenterDelete',
          order: 1,
          title: '删除',
        },
        {
          authCode: 'QMS:FileCenter:Scan',
          name: 'QMSFileCenterScan',
          order: 2,
          title: '扫描',
        },
      ],
    },
  ],
};
