import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      icon: 'lucide:layout-dashboard',
      order: 1000,
      title: 'qms.title',
    },
    name: 'QMS',
    path: '/qms',
    children: [
      {
        name: 'QMSWorkspace',
        path: 'workspace',
        component: () => import('#/views/qms/workspace/index.vue'),
        meta: {
          icon: 'lucide:briefcase',
          title: 'qms.workspace.title',
        },
      },
      {
        name: 'QMSDashboard',
        path: 'dashboard',
        component: () => import('#/views/qms/dashboard/index.vue'),
        meta: {
          icon: 'lucide:layout-template',
          title: 'qms.dashboard.title',
        },
      },
      {
        name: 'QMSQualityLoss',
        path: 'quality-loss',
        component: () => import('#/views/qms/quality-loss/index.vue'),
        meta: {
          icon: 'lucide:trending-down',
          title: 'qms.qualityLoss.title',
        },
      },
      {
        name: 'QMSWorkOrder',
        path: 'work-order',
        component: () => import('#/views/qms/work-order/index.vue'),
        meta: {
          icon: 'lucide:clipboard-list',
          title: 'qms.workOrder.title',
        },
      },
      {
        name: 'QMSInspection',
        path: 'inspection',
        meta: {
          icon: 'lucide:inspection-panel',
          title: 'qms.inspection.title',
        },
        children: [
          {
            name: 'QMSInspectionIssues',
            path: 'issues',
            component: () => import('#/views/qms/inspection/issues/index.vue'),
            meta: {
              title: 'qms.inspection.issues.title',
            },
          },
          {
            name: 'QMSInspectionRecords',
            path: 'records',
            component: () => import('#/views/qms/inspection/records/index.vue'),
            meta: {
              title: 'qms.inspection.records.title',
            },
          },
        ],
      },
      {
        name: 'QMSPlanning',
        path: 'planning',
        meta: {
          icon: 'lucide:notebook-pen',
          title: 'qms.planning.title',
        },
        children: [
          {
            name: 'QMSPlanningDFMEA',
            path: 'dfmea',
            component: () => import('#/views/qms/planning/dfmea/index.vue'),
            meta: {
              title: 'qms.planning.dfmea.title',
            },
          },
          {
            name: 'QMSPlanningProjectDocs',
            path: 'project-docs',
            component: () => import('#/views/qms/planning/project-docs/index.vue'),
            meta: {
              title: '项目资料',
            },
          },
          {
            name: 'QMSPlanningBOM',
            path: 'bom',
            component: () => import('#/views/qms/planning/bom/index.vue'),
            meta: {
              title: 'qms.planning.bom.title',
            },
          },
          {
            name: 'QMSPlanningITP',
            path: 'itp',
            component: () => import('#/views/qms/planning/itp/index.vue'),
            meta: {
              title: 'qms.planning.itp.title',
            },
          },
        ],
      },
      {
        name: 'QMSAfterSales',
        path: 'after-sales',
        component: () => import('#/views/qms/after-sales/index.vue'),
        meta: {
          icon: 'lucide:phone-call',
          title: 'qms.afterSales.title',
        },
      },
      {
        name: 'QMSSupplier',
        path: 'supplier',
        component: () => import('#/views/qms/supplier/index.vue'),
        meta: {
          icon: 'lucide:truck',
          title: 'qms.supplier.title',
        },
      },
      {
        name: 'QMSOutsourcing',
        path: 'outsourcing',
        component: () => import('#/views/qms/outsourcing/index.vue'),
        meta: {
          icon: 'lucide:factory',
          title: 'qms.outsourcing.title',
        },
      },
      {
        name: 'QMSKnowledge',
        path: 'knowledge',
        component: () => import('#/views/qms/knowledge/index.vue'),
        meta: {
          icon: 'lucide:book-open',
          title: 'qms.knowledge.title',
        },
      },
      {
        name: 'QMSDailyReports',
        path: 'daily-reports',
        component: () => import('#/views/qms/reports/index.vue'),
        meta: {
          icon: 'lucide:file-bar-chart',
          title: 'qms.reports.daily.title',
        },
      },
    ],
  },
];

export default routes;
