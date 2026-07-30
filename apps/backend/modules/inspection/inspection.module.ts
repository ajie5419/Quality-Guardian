import type { ModuleDeclaration } from '~/utils/module-types';

import {
  AUDIT_TEMPLATES,
  INSPECTION_ISSUE_PERMISSION_CODES,
} from '@qgs/shared';

export const inspectionModule: ModuleDeclaration = {
  name: 'inspection',
  menus: [
    {
      key: 'inspection-dashboard',
      parentPath: '/qms/inspection',
      path: '/qms/inspection/dashboard',
      name: 'QMSInspectionDashboard',
      component: 'qms/inspection/dashboard/index',
      authCode: 'QMS:Inspection:Dashboard:List',
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
    {
      key: 'inspection-material-requests',
      parentPath: '/qms/inspection',
      path: '/qms/inspection/material-requests',
      name: 'QMSInspectionMaterialRequests',
      component: 'qms/inspection/material-requests/index',
      authCode: 'QMS:Inspection:MaterialRequests:List',
      order: 4,
      type: 'menu',
      meta: {
        icon: 'carbon:request-quote',
        title: '物料申请',
      },
      buttons: [
        {
          authCode: 'QMS:Inspection:MaterialRequests:Approve',
          name: 'QMSInspectionMaterialRequestsApprove',
          order: 1,
          title: '审核通过',
        },
        {
          authCode: 'QMS:Inspection:MaterialRequests:Reject',
          name: 'QMSInspectionMaterialRequestsReject',
          order: 2,
          title: '驳回',
        },
      ],
    },
    {
      key: 'inspection-issues',
      parentPath: '/qms/inspection',
      path: '/qms/inspection/issues',
      name: 'QMSInspectionIssues',
      component: 'qms/inspection/issues/index',
      authCode: INSPECTION_ISSUE_PERMISSION_CODES.LIST,
      order: 5,
      type: 'menu',
      meta: {
        icon: 'carbon:warning-alt',
        title: '不合格品项',
      },
      buttons: [
        {
          authCode: INSPECTION_ISSUE_PERMISSION_CODES.VIEW,
          name: 'QMSInspectionIssuesView',
          order: 1,
          title: '查看',
        },
        {
          authCode: INSPECTION_ISSUE_PERMISSION_CODES.CREATE,
          name: 'QMSInspectionIssuesCreate',
          order: 2,
          title: '新增',
        },
        {
          authCode: INSPECTION_ISSUE_PERMISSION_CODES.EDIT,
          name: 'QMSInspectionIssuesEdit',
          order: 3,
          title: '编辑',
        },
        {
          authCode: INSPECTION_ISSUE_PERMISSION_CODES.DELETE,
          name: 'QMSInspectionIssuesDelete',
          order: 4,
          title: '删除',
        },
        {
          authCode: 'QMS:Inspection:Issues:Settle',
          name: 'QMSInspectionIssuesSettle',
          order: 5,
          title: '案例沉淀',
        },
        {
          authCode: 'QMS:Inspection:Issues:ChartAdd',
          name: 'QMSInspectionIssuesChartAdd',
          order: 6,
          title: '新增图表',
        },
        {
          authCode: 'QMS:Inspection:Issues:ChartEdit',
          name: 'QMSInspectionIssuesChartEdit',
          order: 7,
          title: '编辑图表',
        },
        {
          authCode: 'QMS:Inspection:Issues:ChartDelete',
          name: 'QMSInspectionIssuesChartDelete',
          order: 8,
          title: '删除图表',
        },
      ],
    },
  ],
  dataScope: {
    deptFields: ['responsibleDepartment', 'responsibleBU'],
    selfFields: ['inspector', 'lastEditor'],
  },
  audit: {
    materialRequestApprove: {
      action: 'UPDATE',
      targetType: 'inspection_material_request',
      detailsTemplate: '审核通过物料申请：{{requestNo}}',
    },
    materialRequestReject: {
      action: 'UPDATE',
      targetType: 'inspection_material_request',
      detailsTemplate: '驳回物料申请：{{requestNo}}',
    },
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
