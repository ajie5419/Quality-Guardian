import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      icon: 'lucide:settings',
      title: 'sys.title',
      order: 1000,
      authority: ['super', 'admin'],
    },
    name: 'System',
    path: '/system',
    children: [
      {
        name: 'SystemDept',
        path: '/system/dept',
        component: () => import('#/views/system/dept/index.vue'),
        meta: {
          title: 'sys.dept.title',
        },
      },
      {
        name: 'SystemRole',
        path: '/system/role',
        component: () => import('#/views/system/role/index.vue'),
        meta: {
          title: 'sys.role.title',
        },
      },
      {
        name: 'SystemUser',
        path: '/system/user',
        component: () => import('#/views/system/user/index.vue'),
        meta: {
          title: 'sys.user.title',
        },
      },
      {
        name: 'AiSettings',
        path: '/system/ai-settings',
        component: () => import('#/views/system/ai-settings/index.vue'),
        meta: {
          title: 'sys.aiSettings.title',
        },
      },
    ],
  },
];

export default routes;
