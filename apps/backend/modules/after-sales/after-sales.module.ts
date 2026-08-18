import type { ModuleDeclaration } from '~/utils/module-types';

import { AUDIT_TEMPLATES, PERMISSION_CODES } from '@qgs/shared';

export const afterSalesModule: ModuleDeclaration = {
  name: 'after-sales',
  menus: [
    {
      key: 'after-sales',
      parentPath: '/qms',
      path: '/qms/after-sales',
      name: 'QMSAfterSales',
      component: 'qms/after-sales/index',
      authCode: 'QMS:AfterSales:List',
      order: 20,
      type: 'menu',
      meta: {
        icon: 'carbon:phone',
        title: '售后反馈',
      },
      buttons: [
        {
          authCode: PERMISSION_CODES.QMS.AFTER_SALES.CREATE,
          name: 'QMSAfterSalesCreate',
          order: 1,
          title: '新增',
        },
        {
          authCode: PERMISSION_CODES.QMS.AFTER_SALES.EDIT,
          name: 'QMSAfterSalesEdit',
          order: 2,
          title: '编辑',
        },
        {
          authCode: PERMISSION_CODES.QMS.AFTER_SALES.DELETE,
          name: 'QMSAfterSalesDelete',
          order: 3,
          title: '删除',
        },
        {
          authCode: 'QMS:AfterSales:Export',
          name: 'QMSAfterSalesExport',
          order: 4,
          title: '导出',
        },
        {
          authCode: 'QMS:AfterSales:Settle',
          name: 'QMSAfterSalesSettle',
          order: 5,
          title: '案例沉淀',
        },
        {
          authCode: 'QMS:AfterSales:ChartAdd',
          name: 'QMSAfterSalesChartAdd',
          order: 6,
          title: '新增图表',
        },
        {
          authCode: 'QMS:AfterSales:ChartEdit',
          name: 'QMSAfterSalesChartEdit',
          order: 7,
          title: '编辑图表',
        },
        {
          authCode: 'QMS:AfterSales:ChartDelete',
          name: 'QMSAfterSalesChartDelete',
          order: 8,
          title: '删除图表',
        },
      ],
    },
  ],
  dataScope: {
    deptFields: ['division', 'feedbackDept', 'respDept'],
    selfFields: ['handler'],
  },
  audit: {
    create: {
      action: 'CREATE',
      targetType: 'after_sales',
      detailsTemplate: '新增售后记录: {{projectName}} ({{id}})',
    },
    delete: {
      action: 'DELETE',
      targetType: 'after_sales',
      detailsTemplate: AUDIT_TEMPLATES.AFTER_SALES_SOFT_DELETE,
    },
    update: {
      action: 'UPDATE',
      targetType: 'after_sales',
      detailsTemplate: '修改售后记录: {{id}}',
    },
  },
};
