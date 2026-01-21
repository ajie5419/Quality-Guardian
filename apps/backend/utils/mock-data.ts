export interface UserInfo {
  id: number | string;
  userId?: number | string; // 兼容前端字段
  password: string;
  realName: string;
  roles: string[];
  username: string;
  homePath?: string;
  avatar?: string;
}

export const MOCK_USERS: UserInfo[] = [
  {
    id: 0,
    userId: 0,
    password: '123456',
    realName: 'Vben',
    roles: ['super'],
    username: 'vben',
    avatar: '/uploads/avatar-v1.svg',
  },
  {
    id: 1,
    userId: 1,
    password: '123456',
    realName: 'Admin',
    roles: ['admin'],
    username: 'admin',
    homePath: '/qms/dashboard',
    avatar: '/uploads/avatar-v1.svg',
  },
  {
    id: 2,
    userId: 2,
    password: '123456',
    realName: 'Jack',
    roles: ['user'],
    username: 'jack',
    homePath: '/qms/dashboard',
    avatar: '/uploads/avatar-v1.svg',
  },
  {
    id: 3,
    userId: 3,
    password: '123456',
    realName: '访客',
    roles: ['guest'],
    username: 'guest',
    homePath: '/qms/dashboard',
    avatar: '/uploads/avatar-v1.svg',
  },
];

export const MOCK_CODES = [
  // super - 超级管理员: 所有权限
  {
    codes: [
      // 系统管理权限
      'System:Dept:Create',
      'System:Dept:Edit',
      'System:Dept:Delete',
      'System:Dept:List',
      'System:Role:Create',
      'System:Role:Edit',
      'System:Role:Delete',
      'System:Role:List',
      'System:Menu:Create',
      'System:Menu:Edit',
      'System:Menu:Delete',
      'System:Menu:List',
      'System:User:Create',
      'System:User:Edit',
      'System:User:Delete',
      'System:User:List',
      'System:AiSettings:View',
      'System:AiSettings:Edit',

      // QMS 模块权限
      'QMS:Workspace:View',
      'QMS:Dashboard:View',

      'QMS:WorkOrder:Create',
      'QMS:WorkOrder:Edit',
      'QMS:WorkOrder:Delete',
      'QMS:WorkOrder:View',
      'QMS:WorkOrder:Export',

      // QMS Planning
      'QMS:Planning:DFMEA:View',
      'QMS:Planning:DFMEA:Create',
      'QMS:Planning:DFMEA:Edit',
      'QMS:Planning:DFMEA:Delete',
      'QMS:Planning:DFMEA:Archive',
      'QMS:Planning:DFMEA:Dispatch',
      'QMS:Planning:DFMEA:Export',

      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:ProjectDocs:Archive',
      'QMS:Planning:ProjectDocs:Export',

      'QMS:Planning:BOM:View',
      'QMS:Planning:BOM:Create',
      'QMS:Planning:BOM:Edit',
      'QMS:Planning:BOM:Delete',
      'QMS:Planning:BOM:Archive',
      'QMS:Planning:BOM:Export',

      'QMS:Planning:ITP:View',
      'QMS:Planning:ITP:Create',
      'QMS:Planning:ITP:Edit',
      'QMS:Planning:ITP:Delete',
      'QMS:Planning:ITP:Archive',
      'QMS:Planning:ITP:Dispatch',
      'QMS:Planning:ITP:Export',

      // QMS Inspection
      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Issues:Create',
      'QMS:Inspection:Issues:Edit',
      'QMS:Inspection:Issues:Delete',
      'QMS:Inspection:Issues:Settle',
      'QMS:Inspection:Issues:Export',

      'QMS:Inspection:Records:View',
      'QMS:Inspection:Records:Create',
      'QMS:Inspection:Records:Edit',
      'QMS:Inspection:Records:Delete',
      'QMS:Inspection:Records:Export',

      // Others
      'QMS:AfterSales:Create',
      'QMS:AfterSales:Edit',
      'QMS:AfterSales:Delete',
      'QMS:AfterSales:View',
      'QMS:AfterSales:Settle',
      'QMS:AfterSales:Export',

      'QMS:Supplier:Create',
      'QMS:Supplier:Edit',
      'QMS:Supplier:Delete',
      'QMS:Supplier:View',
      'QMS:Supplier:Export',

      'QMS:Outsourcing:View',
      'QMS:Outsourcing:Create',
      'QMS:Outsourcing:Edit',
      'QMS:Outsourcing:Delete',
      'QMS:Outsourcing:Export',

      'QMS:Reports:Daily:View',
      'QMS:Reports:Summary:View',
      'QMS:Reports:Export',

      'QMS:LossAnalysis:View',
      'QMS:LossAnalysis:Create',
      'QMS:LossAnalysis:Edit',
      'QMS:LossAnalysis:Delete',
      'QMS:LossAnalysis:Export',

      'QMS:Knowledge:Create',
      'QMS:Knowledge:Edit',
      'QMS:Knowledge:Delete',
      'QMS:Knowledge:View',
      'QMS:Knowledge:Export',

      // 旧版兼容 (Legacy compatibility)
      'QMS:Inspection:Create',
      'QMS:Inspection:Edit',
      'QMS:Inspection:Delete',
      'QMS:Inspection:View',
      'QMS:Reports:View',
    ],
    username: 'vben',
  },
  // admin - 管理员: 除了系统设置外的所有权限
  {
    codes: [
      // 系统管理权限
      'System:Dept:Create',
      'System:Dept:Edit',
      'System:Dept:Delete',
      'System:Dept:List',
      'System:Role:Create',
      'System:Role:Edit',
      'System:Role:Delete',
      'System:Role:List',
      'System:Menu:List', // 只能查看菜单，不能修改
      'System:User:Create',
      'System:User:Edit',
      'System:User:Delete',
      'System:User:List',
      'System:AiSettings:View',
      'System:AiSettings:Edit',

      // QMS 模块权限 (Same as super for admin in this context)
      'QMS:Workspace:View',
      'QMS:Dashboard:View',

      'QMS:WorkOrder:Create',
      'QMS:WorkOrder:Edit',
      'QMS:WorkOrder:Delete',
      'QMS:WorkOrder:View',
      'QMS:WorkOrder:Export',

      'QMS:Planning:DFMEA:View',
      'QMS:Planning:DFMEA:Create',
      'QMS:Planning:DFMEA:Edit',
      'QMS:Planning:DFMEA:Delete',
      'QMS:Planning:DFMEA:Archive',
      'QMS:Planning:DFMEA:Dispatch',
      'QMS:Planning:DFMEA:Export',

      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:ProjectDocs:Archive',
      'QMS:Planning:ProjectDocs:Export',

      'QMS:Planning:BOM:View',
      'QMS:Planning:BOM:Create',
      'QMS:Planning:BOM:Edit',
      'QMS:Planning:BOM:Delete',
      'QMS:Planning:BOM:Archive',
      'QMS:Planning:BOM:Export',

      'QMS:Planning:ITP:View',
      'QMS:Planning:ITP:Create',
      'QMS:Planning:ITP:Edit',
      'QMS:Planning:ITP:Delete',
      'QMS:Planning:ITP:Archive',
      'QMS:Planning:ITP:Dispatch',
      'QMS:Planning:ITP:Export',

      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Issues:Create',
      'QMS:Inspection:Issues:Edit',
      'QMS:Inspection:Issues:Delete',
      'QMS:Inspection:Issues:Settle',
      'QMS:Inspection:Issues:Export',

      'QMS:Inspection:Records:View',
      'QMS:Inspection:Records:Create',
      'QMS:Inspection:Records:Edit',
      'QMS:Inspection:Records:Delete',
      'QMS:Inspection:Records:Export',

      'QMS:AfterSales:Create',
      'QMS:AfterSales:Edit',
      'QMS:AfterSales:Delete',
      'QMS:AfterSales:View',
      'QMS:AfterSales:Settle',
      'QMS:AfterSales:Export',

      'QMS:Supplier:Create',
      'QMS:Supplier:Edit',
      'QMS:Supplier:Delete',
      'QMS:Supplier:View',
      'QMS:Supplier:Export',

      'QMS:Outsourcing:View',
      'QMS:Outsourcing:Create',
      'QMS:Outsourcing:Edit',
      'QMS:Outsourcing:Delete',
      'QMS:Outsourcing:Export',

      'QMS:Reports:Daily:View',
      'QMS:Reports:Summary:View',
      'QMS:Reports:Export',

      'QMS:LossAnalysis:View',
      'QMS:LossAnalysis:Create',
      'QMS:LossAnalysis:Edit',
      'QMS:LossAnalysis:Delete',
      'QMS:LossAnalysis:Export',

      'QMS:Knowledge:Create',
      'QMS:Knowledge:Edit',
      'QMS:Knowledge:Delete',
      'QMS:Knowledge:View',
      'QMS:Knowledge:Export',

      // 旧版兼容
      'QMS:Inspection:Create',
      'QMS:Inspection:Edit',
      'QMS:Inspection:Delete',
      'QMS:Inspection:View',
      'QMS:Reports:View',
    ],
    username: 'admin',
  },
  // user - 普通用户: 只能查看，不能做关键业务变更
  {
    codes: [
      // 系统管理权限 - 只有查看
      'System:Dept:List',
      'System:Role:List',

      // QMS 模块权限 - 主要是 View
      'QMS:Workspace:View',
      'QMS:Dashboard:View',
      'QMS:WorkOrder:View',

      'QMS:Planning:DFMEA:View',
      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:BOM:View',
      'QMS:Planning:ITP:View',

      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Records:View',

      'QMS:AfterSales:View',
      'QMS:Supplier:View',
      'QMS:Outsourcing:View',
      'QMS:Reports:Daily:View',
      // No Summary View, No Loss Analysis

      'QMS:Knowledge:View',

      // 旧版兼容
      'QMS:Inspection:View',
      'QMS:Reports:View',
    ],
    username: 'jack',
  },
  // guest - 访客: 只能浏览，不能任何编辑操作
  {
    codes: [
      // 系统管理 - 无权限
      // QMS 模块 - 只有查看权限
      'QMS:WorkOrder:View',
      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Records:View',
      'QMS:AfterSales:View',
      'QMS:Supplier:View',
      'QMS:Inspection:View', // Legacy
    ],
    username: 'guest',
  },
];

const dashboardMenus: any[] = [];

const _createDemosMenus = (role: 'admin' | 'super' | 'user') => {
  const roleWithMenus = {
    admin: {
      component: 'demos/access/admin-visible',
      meta: {
        icon: 'mdi:button-cursor',
        title: 'demos.access.adminVisible',
      },
      name: 'AccessAdminVisibleDemo',
      path: '/demos/access/admin-visible',
    },
    super: {
      component: 'demos/access/super-visible',
      meta: {
        icon: 'mdi:button-cursor',
        title: 'demos.access.superVisible',
      },
      name: 'AccessSuperVisibleDemo',
      path: '/demos/access/super-visible',
    },
    user: {
      component: 'demos/access/user-visible',
      meta: {
        icon: 'mdi:button-cursor',
        title: 'demos.access.userVisible',
      },
      name: 'AccessUserVisibleDemo',
      path: '/demos/access/user-visible',
    },
  };

  return [
    {
      meta: {
        icon: 'ic:baseline-view-in-ar',
        keepAlive: true,
        order: 1000,
        title: 'demos.title',
      },
      name: 'Demos',
      path: '/demos',
      redirect: '/demos/access',
      children: [
        {
          name: 'AccessDemos',
          path: '/demosaccess',
          meta: {
            icon: 'mdi:cloud-key-outline',
            title: 'demos.access.backendPermissions',
          },
          redirect: '/demos/access/page-control',
          children: [
            {
              name: 'AccessPageControlDemo',
              path: '/demos/access/page-control',
              component: 'demos/access/index',
              meta: {
                icon: 'mdi:page-previous-outline',
                title: 'demos.access.pageAccess',
              },
            },
            {
              name: 'AccessButtonControlDemo',
              path: '/demos/access/button-control',
              component: 'demos/access/button-control',
              meta: {
                icon: 'mdi:button-cursor',
                title: 'demos.access.buttonControl',
              },
            },
            {
              name: 'AccessMenuVisible403Demo',
              path: '/demos/access/menu-visible-403',
              component: 'demos/access/menu-visible-403',
              meta: {
                authority: ['no-body'],
                icon: 'mdi:button-cursor',
                menuVisibleWithForbidden: true,
                title: 'demos.access.menuVisible403',
              },
            },
            roleWithMenus[role],
          ],
        },
      ],
    },
  ];
};

export const MOCK_MENUS = [
  { menus: [...dashboardMenus], username: 'vben' },
  { menus: [...dashboardMenus], username: 'admin' },
  { menus: [...dashboardMenus], username: 'jack' },
];

export const MOCK_MENU_LIST = [
  {
    id: 2,
    meta: {
      icon: 'carbon:settings',
      order: 9997,
      title: '系统管理',
    },
    status: 1,
    type: 'catalog',
    name: 'System',
    path: '/system',
    children: [
      {
        id: 201,
        pid: 2,
        path: '/system/menu',
        name: 'SystemMenu',
        authCode: 'System:Menu:List',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'carbon:menu',
          title: '菜单管理',
        },
        component: 'system/menu/index',
        children: [
          {
            id: 20_101,
            pid: 201,
            name: 'SystemMenuCreate',
            path: '/system/menu',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Create',
            meta: { title: '新增' },
          },
          {
            id: 20_102,
            pid: 201,
            name: 'SystemMenuEdit',
            path: '/system/menu',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Edit',
            meta: { title: '修改' },
          },
          {
            id: 20_103,
            pid: 201,
            name: 'SystemMenuDelete',
            path: '/system/menu',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Delete',
            meta: { title: '删除' },
          },
        ],
      },
      {
        id: 202,
        pid: 2,
        path: '/system/dept',
        name: 'SystemDept',
        status: 1,
        type: 'menu',
        authCode: 'System:Dept:List',
        meta: {
          icon: 'carbon:container-services',
          title: '部门管理',
        },
        component: 'system/dept/index',
        children: [
          {
            id: 20_401,
            pid: 202,
            name: 'SystemDeptCreate',
            path: '/system/dept',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Create',
            meta: { title: '新增' },
          },
          {
            id: 20_402,
            pid: 202,
            name: 'SystemDeptEdit',
            path: '/system/dept',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Edit',
            meta: { title: '修改' },
          },
          {
            id: 20_403,
            pid: 202,
            name: 'SystemDeptDelete',
            path: '/system/dept',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Delete',
            meta: { title: '删除' },
          },
        ],
      },
      {
        id: 203,
        pid: 2,
        path: '/system/role',
        name: 'SystemRole',
        status: 1,
        type: 'menu',
        authCode: 'System:Role:List',
        meta: {
          icon: 'carbon:user-role',
          title: '角色管理',
        },
        component: 'system/role/index',
        children: [
          {
            id: 20_301,
            pid: 203,
            name: 'SystemRoleCreate',
            path: '/system/role',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Create',
            meta: { title: '新增' },
          },
          {
            id: 20_302,
            pid: 203,
            name: 'SystemRoleEdit',
            path: '/system/role',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Edit',
            meta: { title: '修改' },
          },
          {
            id: 20_303,
            pid: 203,
            name: 'SystemRoleDelete',
            path: '/system/role',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Delete',
            meta: { title: '删除' },
          },
        ],
      },
      {
        id: 204,
        pid: 2,
        path: '/system/user',
        name: 'SystemUser',
        status: 1,
        type: 'menu',
        authCode: 'System:User:List',
        meta: {
          icon: 'carbon:user',
          title: '用户管理',
        },
        component: 'system/user/index',
        children: [
          {
            id: 20_501,
            pid: 204,
            name: 'SystemUserCreate',
            path: '/system/user',
            status: 1,
            type: 'button',
            authCode: 'System:User:Create',
            meta: { title: '新增' },
          },
          {
            id: 20_502,
            pid: 204,
            name: 'SystemUserEdit',
            path: '/system/user',
            status: 1,
            type: 'button',
            authCode: 'System:User:Edit',
            meta: { title: '修改' },
          },
          {
            id: 20_503,
            pid: 204,
            name: 'SystemUserDelete',
            path: '/system/user',
            status: 1,
            type: 'button',
            authCode: 'System:User:Delete',
            meta: { title: '删除' },
          },
        ],
      },
    ],
  },
  {
    id: 3,
    meta: {
      icon: 'lucide:layout-dashboard',
      order: 1,
      title: '质量管理系统',
    },
    name: 'QMS',
    path: '/qms',
    type: 'catalog',
    status: 1,
    children: [
      {
        id: 301,
        name: 'QMSWorkspace',
        path: '/qms/workspace',
        component: 'qms/workspace/index',
        authCode: 'QMS:Workspace:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:briefcase',
          title: '工作台',
        },
      },
      {
        id: 302,
        name: 'QMSDashboard',
        path: '/qms/dashboard',
        component: 'qms/dashboard/index',
        authCode: 'QMS:Dashboard:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:layout-template',
          title: '仪表盘',
        },
      },
      {
        id: 303,
        name: 'QMSQualityLoss',
        path: '/qms/quality-loss',
        component: 'qms/quality-loss/index',
        authCode: 'QMS:LossAnalysis:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:trending-down',
          title: '质量损失',
        },
      },
      {
        id: 304,
        name: 'QMSWorkOrder',
        path: '/qms/work-order',
        component: 'qms/work-order/index',
        authCode: 'QMS:WorkOrder:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:clipboard-list',
          title: '工单管理',
        },
      },
      {
        id: 305,
        name: 'QMSInspection',
        path: '/qms/inspection',
        type: 'catalog',
        status: 1,
        meta: {
          icon: 'lucide:inspection-panel',
          title: '检验管理',
        },
        children: [
          {
            id: 30_501,
            name: 'QMSInspectionIssues',
            path: '/qms/inspection/issues',
            component: 'qms/inspection/issues/index',
            authCode: 'QMS:Inspection:Issues:View',
            status: 1,
            type: 'menu',
            meta: {
              title: '质量问题',
            },
          },
          {
            id: 30_502,
            name: 'QMSInspectionRecords',
            path: '/qms/inspection/records',
            component: 'qms/inspection/records/index',
            authCode: 'QMS:Inspection:Records:View',
            status: 1,
            type: 'menu',
            meta: {
              title: '检验记录',
            },
          },
        ],
      },
      {
        id: 306,
        name: 'QMSPlanning',
        path: '/qms/planning',
        type: 'catalog',
        status: 1,
        meta: {
          icon: 'lucide:notebook-pen',
          title: '质量策划',
        },
        children: [
          {
            id: 30_601,
            name: 'QMSPlanningDFMEA',
            path: '/qms/planning/dfmea',
            component: 'qms/planning/dfmea/index',
            authCode: 'QMS:Planning:DFMEA:View',
            status: 1,
            type: 'menu',
            meta: {
              title: 'DFMEA',
            },
          },
          {
            id: 30_602,
            name: 'QMSPlanningProjectDocs',
            path: '/qms/planning/project-docs',
            component: 'qms/planning/project-docs/index',
            authCode: 'QMS:Planning:ProjectDocs:View',
            status: 1,
            type: 'menu',
            meta: {
              title: '项目资料',
            },
          },
          {
            id: 30_603,
            name: 'QMSPlanningBOM',
            path: '/qms/planning/bom',
            component: 'qms/planning/bom/index',
            authCode: 'QMS:Planning:BOM:View',
            status: 1,
            type: 'menu',
            meta: {
              title: 'BOM管理',
            },
          },
          {
            id: 30_604,
            name: 'QMSPlanningITP',
            path: '/qms/planning/itp',
            component: 'qms/planning/itp/index',
            authCode: 'QMS:Planning:ITP:View',
            status: 1,
            type: 'menu',
            meta: {
              title: 'ITP计划',
            },
          },
        ],
      },
      {
        id: 307,
        name: 'QMSAfterSales',
        path: '/qms/after-sales',
        component: 'qms/after-sales/index',
        authCode: 'QMS:AfterSales:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:phone-call',
          title: '售后服务',
        },
      },
      {
        id: 308,
        name: 'QMSSupplier',
        path: '/qms/supplier',
        component: 'qms/supplier/index',
        authCode: 'QMS:Supplier:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:truck',
          title: '供应商管理',
        },
      },
      {
        id: 309,
        name: 'QMSOutsourcing',
        path: '/qms/outsourcing',
        component: 'qms/outsourcing/index',
        authCode: 'QMS:Outsourcing:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:factory',
          title: '外协管理',
        },
      },
      {
        id: 310,
        name: 'QMSKnowledge',
        path: '/qms/knowledge',
        component: 'qms/knowledge/index',
        authCode: 'QMS:Knowledge:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:book-open',
          title: '知识库',
        },
      },
      {
        id: 311,
        name: 'QMSDailyReports',
        path: '/qms/daily-reports',
        component: 'qms/reports/index',
        authCode: 'QMS:Reports:Daily:View',
        status: 1,
        type: 'menu',
        meta: {
          icon: 'lucide:file-bar-chart',
          title: '日报管理',
        },
      },
    ],
  },
];

export function getMenuIds(menus: unknown[]) {
  const ids: (number | string)[] = [];
  menus.forEach((item) => {
    const i = item as { children?: unknown[]; id: number | string };
    ids.push(i.id);
    if (i.children && i.children.length > 0) {
      ids.push(...getMenuIds(i.children));
    }
  });
  return ids;
}
