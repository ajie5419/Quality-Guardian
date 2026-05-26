import type { ModuleDeclaration } from '~/utils/module-types';

import { AUDIT_TEMPLATES } from '@qgs/shared';

export const inspectionModule: ModuleDeclaration = {
  name: 'inspection',
  menus: [
    {
      key: 'inspection-dashboard',
      parentPath: '/qms/inspection',
      path: '/qms/inspection/dashboard',
      name: 'QMSInspectionDashboard',
      component: 'qms/inspection/dashboard/index',
      authCode: 'QMS:Inspection:Requests:List',
      order: 2,
      type: 'menu',
      meta: {
        icon: 'carbon:chart-column',
        title: '报检看板',
      },
    },
    {
      key: 'inspection-requests',
      parentPath: '/qms/inspection',
      path: '/qms/inspection/requests',
      name: 'QMSInspectionRequests',
      component: 'qms/inspection/requests/index',
      authCode: 'QMS:Inspection:Requests:List',
      order: 3,
      type: 'menu',
      meta: {
        icon: 'carbon:qr-code',
        title: '报检任务',
      },
      buttons: [
        {
          authCode: 'QMS:Inspection:Requests:Create',
          name: 'QMSInspectionRequestsCreate',
          order: 1,
          title: '新增',
        },
        {
          authCode: 'QMS:Inspection:Requests:Dispatch',
          name: 'QMSInspectionRequestsDispatch',
          order: 2,
          title: '派单',
        },
        {
          authCode: 'QMS:Inspection:Requests:Close',
          name: 'QMSInspectionRequestsClose',
          order: 3,
          title: '关闭',
        },
        {
          authCode: 'QMS:Inspection:Requests:Delete',
          name: 'QMSInspectionRequestsDelete',
          order: 4,
          title: '删除',
        },
      ],
    },
  ],
  dataScope: {
    deptFields: ['responsibleDepartment', 'responsibleBU'],
    selfFields: ['inspector', 'lastEditor'],
  },
  audit: {
    requestCreate: {
      action: 'CREATE',
      targetType: 'inspection_request',
      detailsTemplate: '新增报检任务: {{requestNo}}',
    },
    requestDispatch: {
      action: 'UPDATE',
      targetType: 'inspection_request',
      detailsTemplate: '派发报检任务: {{requestNo}}',
    },
    requestDelete: {
      action: 'DELETE',
      targetType: 'inspection_request',
      detailsTemplate: '删除报检任务: {{requestNo}}',
    },
    requestClose: {
      action: 'UPDATE',
      targetType: 'inspection_request',
      detailsTemplate:
        '关闭报检任务: {{requestNo}}，关联检验记录: {{inspectionId}}',
    },
    issueCreate: {
      action: 'CREATE',
      targetType: 'inspection_issue',
      detailsTemplate: '新增检验问题: {{partName}} ({{nonConformanceNumber}})',
    },
    issueCreateFromClose: {
      action: 'CREATE',
      targetType: 'inspection_issue',
      detailsTemplate: '新增检验问题: {{issue}} ({{nonConformanceNumber}})',
    },
    issueUpdate: {
      action: 'UPDATE',
      targetType: 'inspection_issue',
      detailsTemplate: '修改检验问题: {{partName}} ({{nonConformanceNumber}})',
    },
    issueCloseLinked: {
      action: 'UPDATE',
      targetType: 'inspection_issue',
      detailsTemplate: '复检合格关闭关联检验问题: {{linkedIssue}}',
    },
    issueDelete: {
      action: 'DELETE',
      targetType: 'inspection_issue',
      detailsTemplate: AUDIT_TEMPLATES.INSPECTION_ISSUE_SOFT_DELETE,
    },
    issueBatchDelete: {
      action: 'DELETE',
      targetType: 'inspection_issue',
      detailsTemplate: '批量删除不合格品项: {{count}} 条',
    },
    issueImport: {
      action: 'CREATE',
      targetType: 'inspection_issue',
      detailsTemplate: '导入不合格品项: {{successCount}}/{{totalCount}} 条',
    },
  },
};
