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
        title: '报检与检验设置',
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
    {
      key: 'system-quality-classifications',
      parentPath: '/system',
      path: '/system/quality-classifications',
      name: 'SystemQualityClassifications',
      component: 'system/quality-classifications/index',
      authCode: 'System:QualityClassification:List',
      order: 7,
      type: 'menu',
      meta: {
        icon: 'carbon:category',
        title: '质量分类设置',
      },
      buttons: [
        {
          authCode: 'System:QualityClassification:Edit',
          name: 'SystemQualityClassificationsEdit',
          order: 1,
          title: '修改分类',
        },
      ],
    },
    {
      key: 'system-master-data-governance',
      parentPath: '/system',
      path: '/system/master-data-governance',
      name: 'SystemMasterDataGovernance',
      component: 'system/master-data-governance/index',
      authCode: 'System:MasterDataGovernance:List',
      order: 8,
      type: 'menu',
      meta: {
        icon: 'carbon:data-check',
        title: '主数据治理',
      },
      buttons: [
        {
          authCode: 'System:MasterDataGovernance:Edit',
          name: 'SystemMasterDataGovernanceEdit',
          order: 1,
          title: '处置治理项',
        },
      ],
    },
  ],
};
