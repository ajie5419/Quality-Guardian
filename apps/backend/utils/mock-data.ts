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
      
      // QMS Planning
      'QMS:Planning:DFMEA:View',
      'QMS:Planning:DFMEA:Create',
      'QMS:Planning:DFMEA:Edit',
      'QMS:Planning:DFMEA:Delete',
      
      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:ProjectDocs:Archive',
      
      'QMS:Planning:BOM:View',
      'QMS:Planning:BOM:Create',
      'QMS:Planning:BOM:Edit',
      'QMS:Planning:BOM:Delete',
      
      'QMS:Planning:ITP:View',
      'QMS:Planning:ITP:Create',
      'QMS:Planning:ITP:Edit',
      'QMS:Planning:ITP:Delete',
      
      // QMS Inspection
      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Issues:Create',
      'QMS:Inspection:Issues:Edit',
      'QMS:Inspection:Issues:Delete',
      'QMS:Inspection:Issues:Settle',
      
      'QMS:Inspection:Records:View',
      'QMS:Inspection:Records:Create',
      'QMS:Inspection:Records:Edit',
      'QMS:Inspection:Records:Delete',
      
      // Others
      'QMS:AfterSales:Create',
      'QMS:AfterSales:Edit',
      'QMS:AfterSales:Delete',
      'QMS:AfterSales:View',
      'QMS:AfterSales:Settle',
      
      'QMS:Supplier:Create',
      'QMS:Supplier:Edit',
      'QMS:Supplier:Delete',
      'QMS:Supplier:View',
      
      'QMS:Outsourcing:View',
      'QMS:Outsourcing:Create',
      'QMS:Outsourcing:Edit',
      'QMS:Outsourcing:Delete',
      
      'QMS:Reports:Daily:View',
      'QMS:Reports:Summary:View',
      'QMS:Reports:Export',
      
      'QMS:LossAnalysis:View',
      'QMS:LossAnalysis:Create',
      'QMS:LossAnalysis:Edit',
      'QMS:LossAnalysis:Delete',
      
      'QMS:Knowledge:Create',
      'QMS:Knowledge:Edit',
      'QMS:Knowledge:Delete',
      'QMS:Knowledge:View',
      
      // 旧版兼容 (Legacy compatibility)
      'QMS:Inspection:Create',
      'QMS:Inspection:Edit',
      'QMS:Inspection:Delete',
      'QMS:Inspection:View',
      'QMS:Reports:View',
      'AC_100100',
      'AC_100110',
      'AC_100120',
      'AC_100010',
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
      'QMS:Planning:DFMEA:View',
      'QMS:Planning:DFMEA:Create',
      'QMS:Planning:DFMEA:Edit',
      'QMS:Planning:DFMEA:Delete',
      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:ProjectDocs:Archive',
      'QMS:Planning:BOM:View',
      'QMS:Planning:BOM:Create',
      'QMS:Planning:BOM:Edit',
      'QMS:Planning:BOM:Delete',
      'QMS:Planning:ITP:View',
      'QMS:Planning:ITP:Create',
      'QMS:Planning:ITP:Edit',
      'QMS:Planning:ITP:Delete',
      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Issues:Create',
      'QMS:Inspection:Issues:Edit',
      'QMS:Inspection:Issues:Delete',
      'QMS:Inspection:Issues:Settle',
      'QMS:Inspection:Records:View',
      'QMS:Inspection:Records:Create',
      'QMS:Inspection:Records:Edit',
      'QMS:Inspection:Records:Delete',
      'QMS:AfterSales:Create',
      'QMS:AfterSales:Edit',
      'QMS:AfterSales:Delete',
      'QMS:AfterSales:View',
      'QMS:AfterSales:Settle',
      'QMS:Supplier:Create',
      'QMS:Supplier:Edit',
      'QMS:Supplier:Delete',
      'QMS:Supplier:View',
      'QMS:Outsourcing:View',
      'QMS:Outsourcing:Create',
      'QMS:Outsourcing:Edit',
      'QMS:Outsourcing:Delete',
      'QMS:Reports:Daily:View',
      'QMS:Reports:Summary:View',
      'QMS:Reports:Export',
      'QMS:LossAnalysis:View',
      'QMS:LossAnalysis:Create',
      'QMS:LossAnalysis:Edit',
      'QMS:LossAnalysis:Delete',
      'QMS:Knowledge:Create',
      'QMS:Knowledge:Edit',
      'QMS:Knowledge:View', // Admin can't delete knowledge? Let's assume standard
      
      // 旧版兼容
      'QMS:Inspection:Create',
      'QMS:Inspection:Edit',
      'QMS:Inspection:Delete',
      'QMS:Inspection:View',
      'QMS:Reports:View',
      'AC_100010',
      'AC_100020',
      'AC_100030',
    ],
    username: 'admin',
  },
  // user - 普通用户: 只能查看和基本操作，不能看质量损失
  {
    codes: [
      // 系统管理权限 - 只有查看
      'System:Dept:List',
      'System:Role:List',
      
      // QMS 模块权限 - 主要是 View 和 Create/Edit, 无 Delete
      'QMS:Workspace:View',
      'QMS:Dashboard:View',
      'QMS:WorkOrder:View',
      'QMS:WorkOrder:Create',
      'QMS:WorkOrder:Edit',
      
      'QMS:Planning:DFMEA:View',
      'QMS:Planning:ProjectDocs:View',
      'QMS:Planning:BOM:View',
      'QMS:Planning:ITP:View',
      
      'QMS:Inspection:Issues:View',
      'QMS:Inspection:Issues:Create',
      'QMS:Inspection:Issues:Edit',
      'QMS:Inspection:Records:View',
      'QMS:Inspection:Records:Create',
      'QMS:Inspection:Records:Edit',
      
      'QMS:AfterSales:View',
      'QMS:Supplier:View',
      'QMS:Outsourcing:View',
      'QMS:Reports:Daily:View',
      // No Summary View, No Loss Analysis
      
      'QMS:Knowledge:View',
      
      // 旧版兼容
      'QMS:Inspection:Create',
      'QMS:Inspection:Edit',
      'QMS:Inspection:View',
      'QMS:Reports:View',
      'AC_1000001',
      'AC_1000002',
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

const qmsMenus = [
  {
    component: 'BasicLayout',
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
        path: '/qms/workspace',
        component: 'qms/workspace/index',
        meta: {
          icon: 'lucide:briefcase',
          title: 'qms.workspace.title',
        },
      },
      {
        name: 'QMSDashboard',
        path: '/qms/dashboard',
        component: 'qms/dashboard/index',
        meta: {
          icon: 'lucide:layout-template',
          title: 'qms.dashboard.title',
        },
      },
      {
        name: 'QMSQualityLoss',
        path: '/qms/quality-loss',
        component: 'qms/quality-loss/index',
        meta: {
          icon: 'lucide:trending-down',
          title: 'qms.qualityLoss.title',
        },
      },
      {
        name: 'QMSWorkOrder',
        path: '/qms/work-order',
        component: 'qms/work-order/index',
        meta: {
          icon: 'lucide:clipboard-list',
          title: 'qms.workOrder.title',
        },
      },
      {
        name: 'QMSInspection',
        path: '/qms/inspection',
        meta: {
          icon: 'lucide:inspection-panel',
          title: 'qms.inspection.title',
        },
        children: [
          {
            name: 'QMSInspectionIssues',
            path: '/qms/inspection/issues',
            component: 'qms/inspection/issues/index',
            meta: {
              title: 'qms.inspection.issues.title',
            },
          },
          {
            name: 'QMSInspectionRecords',
            path: '/qms/inspection/records',
            component: 'qms/inspection/records/index',
            meta: {
              title: 'qms.inspection.records.title',
            },
          },
        ],
      },
      {
        name: 'QMSPlanning',
        path: '/qms/planning',
        meta: {
          icon: 'lucide:notebook-pen',
          title: 'qms.planning.title',
        },
        children: [
          {
            name: 'QMSPlanningDFMEA',
            path: '/qms/planning/dfmea',
            component: 'qms/planning/dfmea/index',
            meta: {
              title: 'qms.planning.dfmea.title',
            },
          },
          {
            name: 'QMSPlanningBOM',
            path: '/qms/planning/bom',
            component: 'qms/planning/bom/index',
            meta: {
              title: 'qms.planning.bom.title',
            },
          },
          {
            name: 'QMSPlanningITP',
            path: '/qms/planning/itp',
            component: 'qms/planning/itp/index',
            meta: {
              title: 'qms.planning.itp.title',
            },
          },
        ],
      },
      {
        name: 'QMSAfterSales',
        path: '/qms/after-sales',
        component: 'qms/after-sales/index',
        meta: {
          icon: 'lucide:phone-call',
          title: 'qms.afterSales.title',
        },
      },
      {
        name: 'QMSSupplier',
        path: '/qms/supplier',
        component: 'qms/supplier/index',
        meta: {
          icon: 'lucide:truck',
          title: 'qms.supplier.title',
        },
      },
      {
        name: 'QMSOutsourcing',
        path: '/qms/outsourcing',
        component: 'qms/outsourcing/index',
        meta: {
          icon: 'lucide:factory',
          title: 'qms.outsourcing.title',
        },
      },
      {
        name: 'QMSKnowledge',
        path: '/qms/knowledge',
        component: 'qms/knowledge/index',
        meta: {
          icon: 'lucide:book-open',
          title: 'qms.knowledge.title',
        },
      },
      {
        name: 'QMSDailyReports',
        path: '/qms/daily-reports',
        component: 'qms/reports/index',
        meta: {
          icon: 'lucide:file-bar-chart',
          title: 'qms.reports.daily.title',
        },
      },
    ],
  },
];

const systemMenus = [
  {
    component: 'BasicLayout',
    meta: {
      icon: 'lucide:settings',
      title: 'sys.title',
      order: 1100,
    },
    name: 'System',
    path: '/system',
    children: [
      {
        name: 'SystemDept',
        path: '/system/dept',
        component: 'system/dept/index',
        meta: {
          title: 'sys.dept.title',
        },
      },
      {
        name: 'SystemRole',
        path: '/system/role',
        component: 'system/role/index',
        meta: {
          title: 'sys.role.title',
        },
      },
      {
        name: 'SystemMenu',
        path: '/system/menu',
        component: 'system/menu/index',
        meta: {
          title: 'sys.menu.title',
        },
      },
      {
        name: 'SystemUser',
        path: '/system/user',
        component: 'system/user/index',
        meta: {
          title: 'sys.user.title',
        },
      },
      {
        name: 'AiSettings',
        path: '/system/ai-settings',
        component: 'system/ai-settings/index',
        meta: {
          title: 'sys.aiSettings.title',
        },
      },
    ],
  },
];

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
      title: 'system.title',
      badge: 'new',
      badgeType: 'normal',
      badgeVariants: 'primary',
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
          title: 'system.menu.title',
        },
        component: 'system/menu/list',
        children: [
          {
            id: 20_101,
            pid: 201,
            name: 'SystemMenuCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_102,
            pid: 201,
            name: 'SystemMenuEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_103,
            pid: 201,
            name: 'SystemMenuDelete',
            status: 1,
            type: 'button',
            authCode: 'System:Menu:Delete',
            meta: { title: 'common.delete' },
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
          title: 'system.dept.title',
        },
        component: 'system/dept/list',
        children: [
          {
            id: 20_401,
            pid: 201,
            name: 'SystemDeptCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_402,
            pid: 201,
            name: 'SystemDeptEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_403,
            pid: 201,
            name: 'SystemDeptDelete',
            status: 1,
            type: 'button',
            authCode: 'System:Dept:Delete',
            meta: { title: 'common.delete' },
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
          title: 'system.role.title',
        },
        component: 'system/role/index',
        children: [
          {
            id: 20_301,
            pid: 203,
            name: 'SystemRoleCreate',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Create',
            meta: { title: 'common.create' },
          },
          {
            id: 20_302,
            pid: 203,
            name: 'SystemRoleEdit',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Edit',
            meta: { title: 'common.edit' },
          },
          {
            id: 20_303,
            pid: 203,
            name: 'SystemRoleDelete',
            status: 1,
            type: 'button',
            authCode: 'System:Role:Delete',
            meta: { title: 'common.delete' },
          },
        ],
      },
    ],
  },
  {
    id: 9,
    meta: {
      badgeType: 'dot',
      order: 9998,
      title: 'demos.vben.title',
      icon: 'carbon:data-center',
    },
    name: 'Project',
    path: '/vben-admin',
    type: 'catalog',
    status: 1,
    children: [
      {
        id: 901,
        pid: 9,
        name: 'VbenDocument',
        path: '/vben-admin/document',
        component: 'IFrameView',
        type: 'embedded',
        status: 1,
        meta: {
          icon: 'carbon:book',
          iframeSrc: 'https://doc.vben.pro',
          title: 'demos.vben.document',
        },
      },
      {
        id: 902,
        pid: 9,
        name: 'VbenGithub',
        path: '/vben-admin/github',
        component: 'IFrameView',
        type: 'link',
        status: 1,
        meta: {
          icon: 'carbon:logo-github',
          link: 'https://github.com/ajie5419/Quality-Guardian',
          title: 'Github',
        },
      },
      {
        id: 903,
        pid: 9,
        name: 'VbenAntdv',
        path: '/vben-admin/antdv',
        component: 'IFrameView',
        type: 'link',
        status: 0,
        meta: {
          icon: 'carbon:hexagon-vertical-solid',
          badgeType: 'dot',
          link: 'https://ant.vben.pro',
          title: 'demos.vben.antdv',
        },
      },
    ],
  },
  {
    id: 10,
    component: '_core/about/index',
    type: 'menu',
    status: 1,
    meta: {
      icon: 'lucide:copyright',
      order: 9999,
      title: 'demos.vben.about',
    },
    name: 'About',
    path: '/about',
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
