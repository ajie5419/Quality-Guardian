import type { ModuleDeclaration } from '~/utils/module-types';

import { AUDIT_TEMPLATES } from '@qgs/shared';

export const afterSalesModule: ModuleDeclaration = {
  name: 'after-sales',
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
      detailsTemplate: '修改售后记录: {{projectName}} ({{id}})',
    },
  },
};
