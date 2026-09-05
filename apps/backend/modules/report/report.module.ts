import type { ModuleDeclaration } from '~/utils/module-types';

export const reportModule: ModuleDeclaration = {
  audit: {
    create: {
      action: 'CREATE',
      detailsTemplate: '新建质量日报: {{date}} ({{id}})',
      targetType: 'reports',
    },
    'daily-summary': {
      action: 'UPDATE',
      detailsTemplate: '保存日报摘要: {{date}} ({{reporter}})',
      targetType: 'daily_reports',
    },
    delete: {
      action: 'DELETE',
      detailsTemplate: '删除质量日报: {{id}} ({{status}})',
      targetType: 'reports',
    },
    update: {
      action: 'UPDATE',
      detailsTemplate: '修改质量日报: {{id}} ({{date}}, {{status}})',
      targetType: 'reports',
    },
  },
  name: 'report',
};
