import type { ModuleDeclaration } from '~/utils/module-types';

import { SUPERVISION_PERMISSION_CODES } from '@qgs/shared';

export const supervisionModule: ModuleDeclaration = {
  audit: {
    'issue-create': {
      action: 'CREATE',
      detailsTemplate: '新建监造问题: {{issueNo}}',
      targetType: 'supervision_issues',
    },
    'issue-delete': {
      action: 'DELETE',
      detailsTemplate: '删除监造问题: {{issueNo}}',
      targetType: 'supervision_issues',
    },
    'issue-update': {
      action: 'UPDATE',
      detailsTemplate: '修改监造问题: {{issueNo}} ({{status}})',
      targetType: 'supervision_issues',
    },
    'project-create': {
      action: 'CREATE',
      detailsTemplate: '新建监造项目: {{projectName}}',
      targetType: 'supervision_projects',
    },
    'project-delete': {
      action: 'DELETE',
      detailsTemplate: '删除监造项目: {{projectName}}',
      targetType: 'supervision_projects',
    },
    'project-update': {
      action: 'UPDATE',
      detailsTemplate: '修改监造项目: {{projectName}} ({{status}})',
      targetType: 'supervision_projects',
    },
    'report-create': {
      action: 'CREATE',
      detailsTemplate: '新建监造日报: {{reportDate}}',
      targetType: 'supervision_daily_reports',
    },
    'report-delete': {
      action: 'DELETE',
      detailsTemplate: '删除监造日报: {{id}}',
      targetType: 'supervision_daily_reports',
    },
    'report-update': {
      action: 'UPDATE',
      detailsTemplate: '修改监造日报: {{id}}',
      targetType: 'supervision_daily_reports',
    },
    'task-create': {
      action: 'CREATE',
      detailsTemplate: '新建监造任务: {{taskNo}}',
      targetType: 'supervision_plan_tasks',
    },
    'task-delete': {
      action: 'DELETE',
      detailsTemplate: '删除监造任务: {{taskNo}}',
      targetType: 'supervision_plan_tasks',
    },
    'task-import': {
      action: 'UPDATE',
      detailsTemplate: '导入监造计划: {{projectId}}',
      targetType: 'supervision_plan_tasks',
    },
    'task-update': {
      action: 'UPDATE',
      detailsTemplate: '修改监造任务: {{taskNo}} ({{progressPercent}}%)',
      targetType: 'supervision_plan_tasks',
    },
  },
  name: 'supervision',
  menus: [
    {
      key: 'supervision',
      parentPath: '/qms',
      path: '/qms/supervision',
      name: 'QMSSupervision',
      component: 'qms/supervision/index',
      authCode: SUPERVISION_PERMISSION_CODES.LIST,
      order: 96,
      type: 'menu',
      meta: {
        icon: 'carbon:location-company',
        orderNo: 96,
        title: '监造管理',
      },
      buttons: [
        {
          authCode: SUPERVISION_PERMISSION_CODES.CREATE,
          name: 'QMSSupervisionCreate',
          order: 1,
          title: '新增',
        },
        {
          authCode: SUPERVISION_PERMISSION_CODES.EDIT,
          name: 'QMSSupervisionEdit',
          order: 2,
          title: '编辑',
        },
        {
          authCode: SUPERVISION_PERMISSION_CODES.DELETE,
          name: 'QMSSupervisionDelete',
          order: 3,
          title: '删除',
        },
      ],
    },
  ],
};
