import type { RouteRecordRaw } from 'vue-router';

export const mobileRoutes: RouteRecordRaw[] = [
  {
    path: '/mobile',
    component: () => import('#/views/mobile/MobileLayout.vue'),
    meta: {
      hideInBreadcrumb: true,
      hideInMenu: true,
      hideInTab: true,
      ignoreAccess: true,
      title: 'Mobile',
    },
    children: [
      {
        path: '',
        redirect: '/mobile/tasks',
      },
      {
        path: 'tasks',
        component: () => import('#/views/mobile/TaskList.vue'),
        meta: { title: '检验任务' },
      },
      {
        path: 'dispatch/:id',
        component: () => import('#/views/mobile/Dispatch.vue'),
        meta: { title: '派单' },
      },
      {
        path: 'inspect/:id',
        component: () => import('#/views/mobile/InspectResult.vue'),
        meta: { title: '检验结果' },
      },
    ],
  },
];
