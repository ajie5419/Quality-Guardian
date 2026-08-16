import type { ModuleDeclaration } from '~/utils/module-types';

export const planningModule: ModuleDeclaration = {
  name: 'planning',
  menus: [
    {
      key: 'project-docs',
      parentPath: '/qms/planning',
      path: '/qms/planning/docs',
      name: 'QMSProjectDocs',
      component: 'qms/planning/project-docs/index',
      authCode: 'QMS:Planning:ProjectDocs:List',
      order: 5,
      type: 'menu',
      meta: {
        icon: 'carbon:document',
        title: '项目文档',
      },
      buttons: [
        {
          authCode: 'QMS:Planning:ProjectDocs:Create',
          name: 'QMSPlanningProjectDocsCreate',
          order: 1,
          title: '新增',
        },
        {
          authCode: 'QMS:Planning:ProjectDocs:Edit',
          name: 'QMSPlanningProjectDocsEdit',
          order: 2,
          title: '编辑',
        },
        {
          authCode: 'QMS:Planning:ProjectDocs:Delete',
          name: 'QMSPlanningProjectDocsDelete',
          order: 3,
          title: '删除',
        },
        {
          authCode: 'QMS:Planning:ProjectDocs:Export',
          name: 'QMSPlanningProjectDocsExport',
          order: 4,
          title: '导出',
        },
        {
          authCode: 'QMS:Planning:ProjectDocs:Download',
          name: 'QMSPlanningProjectDocsDownload',
          order: 5,
          title: '下载',
        },
      ],
    },
  ],
};
