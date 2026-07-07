import type { ModuleDeclaration } from '~/utils/module-types';

export const systemModule: ModuleDeclaration = {
  name: 'system',
  menus: [
    {
      key: 'system-inspection-settings',
      parentPath: '/system',
      path: '/system/inspection-settings',
      name: 'SystemInspectionSettings',
      component: 'system/inspection-settings/index',
      authCode: 'System:InspectionSettings:List',
      order: 6,
      type: 'menu',
      meta: {
        icon: 'carbon:settings-adjust',
        title: '检验记录设置',
      },
      buttons: [
        {
          authCode: 'System:InspectionSettings:Edit',
          name: 'SystemInspectionSettingsEdit',
          order: 1,
          title: '修改配置',
        },
      ],
    },
  ],
};
