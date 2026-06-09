import type { Edge, Node } from '@vue-flow/core';

export type ModuleCategory =
  | 'client'
  | 'gateway'
  | 'infrastructure'
  | 'inspection-domain'
  | 'middleware'
  | 'operations'
  | 'quality-tracking'
  | 'system-base'
  | 'visualization';

export interface ModuleNodeData extends Record<string, unknown> {
  title: string;
  subtitle: string;
  category: ModuleCategory;
  badge?: string;
}

const NODE_W = 220;
const NODE_H = 68;
const COL_GAP = 60;
const ROW_GAP = 22;
const COL_W = NODE_W + COL_GAP;
const ROW_H = NODE_H + ROW_GAP;

// Column anchors
const COL_A = 60;
const COL_B = COL_A + COL_W;
const COL_C = COL_B + COL_W;
const COL_D = COL_C + COL_W;
const COL_E = COL_D + COL_W;
const COL_F = COL_E + COL_W;

const ROW_CLIENT = 0;
const ROW_GATEWAY = 110;
const ROW_MIDDLEWARE = 215;
const ROW_MOD_START = 360;
const ROW_INFRA = ROW_MOD_START + ROW_H * 9 + 30;

function modPos(col: number, idx: number) {
  return { x: col, y: ROW_MOD_START + idx * ROW_H };
}

const groupHeaderY = ROW_MOD_START - 38;

export const nodes: Node<ModuleNodeData>[] = [
  // Group header labels
  {
    id: 'group-inspection',
    type: 'group-header',
    position: { x: COL_A, y: groupHeaderY },
    data: {
      title: '检验作业域',
      subtitle: 'INSPECTION DOMAIN',
      category: 'inspection-domain',
    },
    selectable: false,
    draggable: false,
  },
  {
    id: 'group-quality',
    type: 'group-header',
    position: { x: COL_B, y: groupHeaderY },
    data: {
      title: '质量跟踪域',
      subtitle: 'QUALITY TRACKING',
      category: 'quality-tracking',
    },
    selectable: false,
    draggable: false,
  },
  {
    id: 'group-ops',
    type: 'group-header',
    position: { x: COL_C, y: groupHeaderY },
    data: {
      title: '运营管理域',
      subtitle: 'OPERATIONS',
      category: 'operations',
    },
    selectable: false,
    draggable: false,
  },
  {
    id: 'group-viz',
    type: 'group-header',
    position: { x: COL_D, y: groupHeaderY },
    data: {
      title: '数据呈现域',
      subtitle: 'VISUALIZATION',
      category: 'visualization',
    },
    selectable: false,
    draggable: false,
  },
  {
    id: 'group-sys-1',
    type: 'group-header',
    position: { x: COL_E, y: groupHeaderY },
    data: {
      title: '系统基础（一）',
      subtitle: 'SYSTEM BASE',
      category: 'system-base',
    },
    selectable: false,
    draggable: false,
  },
  {
    id: 'group-sys-2',
    type: 'group-header',
    position: { x: COL_F, y: groupHeaderY },
    data: {
      title: '系统基础（二）',
      subtitle: 'SYSTEM BASE',
      category: 'system-base',
    },
    selectable: false,
    draggable: false,
  },

  // Clients
  {
    id: 'client-web',
    type: 'module',
    position: { x: COL_C, y: ROW_CLIENT },
    data: {
      title: 'Web 管理端',
      subtitle: 'apps/web-antd · Vue 3 + Antd',
      category: 'client',
      badge: 'Frontend',
    },
  },
  {
    id: 'client-mobile',
    type: 'module',
    position: { x: COL_D, y: ROW_CLIENT },
    data: {
      title: '移动端 H5',
      subtitle: '扫码报检 / 任务录入',
      category: 'client',
      badge: 'Mobile',
    },
  },

  // API Gateway
  {
    id: 'api-gateway',
    type: 'module',
    position: { x: COL_C + COL_W / 2, y: ROW_GATEWAY },
    data: {
      title: 'API 网关',
      subtitle: 'apps/backend · Nitro (H3) · :5320',
      category: 'gateway',
      badge: 'Backend',
    },
  },

  // Middleware
  {
    id: 'mw-auth',
    type: 'module',
    position: { x: COL_C, y: ROW_MIDDLEWARE },
    data: {
      title: 'Auth 中间件',
      subtitle: 'verifyAccessToken · 公开路径白名单',
      category: 'middleware',
    },
  },
  {
    id: 'mw-datascope',
    type: 'module',
    position: { x: COL_D, y: ROW_MIDDLEWARE },
    data: {
      title: 'DataScope 中间件',
      subtitle: 'QMS 域内权限过滤',
      category: 'middleware',
    },
  },

  // Inspection domain (col A)
  modCard('inspection', '检验记录与不合格品', 'inspection-domain', COL_A, 0),
  modCard('work-order', '生产工单与状态流转', 'inspection-domain', COL_A, 1),
  modCard(
    'work-order-requirement',
    '工单质量要求汇总',
    'inspection-domain',
    COL_A,
    2,
  ),
  modCard('task-dispatch', 'ITP 任务派发', 'inspection-domain', COL_A, 3),
  modCard('planning', '质量策划 BOM/DFMEA/ITP', 'inspection-domain', COL_A, 4),

  // Quality tracking (col B)
  modCard('after-sales', '售后反馈单流转', 'quality-tracking', COL_B, 0),
  modCard('quality-loss', '质量损失记录与分析', 'quality-tracking', COL_B, 1),
  modCard('supplier', '供应商质量评分', 'quality-tracking', COL_B, 2),
  modCard(
    'vehicle-commissioning',
    '车辆调试验收（审批流）',
    'quality-tracking',
    COL_B,
    3,
  ),

  // Operations (col C)
  modCard('metrology', '计量器具全生命周期', 'operations', COL_C, 0),
  modCard('welder', '焊工资质台账', 'operations', COL_C, 1),
  modCard('knowledge', '质量知识库', 'operations', COL_C, 2),
  modCard('supervision', '质量监督检查', 'operations', COL_C, 3),

  // Visualization (col D)
  modCard('dashboard', '质量驾驶舱聚合', 'visualization', COL_D, 0),
  modCard('report', '质量报表生成', 'visualization', COL_D, 1),
  modCard('ai', 'AI 对话/补全接入', 'visualization', COL_D, 2),

  // System base part 1 (col E)
  modCard('system', '系统配置与基础设置', 'system-base', COL_E, 0),
  modCard('user', '用户账号与认证', 'system-base', COL_E, 1),
  modCard('rbac', '角色权限与菜单授权', 'system-base', COL_E, 2),
  modCard('dept', '部门组织架构', 'system-base', COL_E, 3),

  // System base part 2 (col F)
  modCard('dictionary', '系统字典数据', 'system-base', COL_F, 0),
  modCard('data-scope', '数据权限过滤引擎', 'system-base', COL_F, 1),
  modCard('system-log', '系统操作日志', 'system-base', COL_F, 2),
  modCard('file-storage', 'QMS 文件中心', 'system-base', COL_F, 3),

  // Infrastructure
  {
    id: 'infra-mysql',
    type: 'module',
    position: { x: COL_B, y: ROW_INFRA },
    data: {
      title: 'MySQL 8',
      subtitle: 'Prisma 6.2 · 唯一持久层',
      category: 'infrastructure',
      badge: 'Database',
    },
  },
  {
    id: 'infra-redis',
    type: 'module',
    position: { x: COL_C + COL_W / 2, y: ROW_INFRA },
    data: {
      title: 'Redis',
      subtitle: '菜单/权限缓存 · 限流',
      category: 'infrastructure',
      badge: 'Cache',
    },
  },
  {
    id: 'infra-oss',
    type: 'module',
    position: { x: COL_E, y: ROW_INFRA },
    data: {
      title: '阿里云 OSS',
      subtitle: '附件存储（无 OSS 时回退本地）',
      category: 'infrastructure',
      badge: 'Storage',
    },
  },
];

function modCard(
  id: string,
  subtitle: string,
  category: ModuleCategory,
  col: number,
  rowIdx: number,
): Node<ModuleNodeData> {
  return {
    id,
    type: 'module',
    position: modPos(col, rowIdx),
    data: { title: id, subtitle, category },
  };
}

// Cross-module dependencies (A depends on B → arrow from A to B)
const moduleDeps: Record<string, string[]> = {
  'after-sales': [
    'data-scope',
    'dept',
    'file-storage',
    'quality-loss',
    'system-log',
    'work-order',
  ],
  ai: ['system'],
  dashboard: [
    'after-sales',
    'inspection',
    'quality-loss',
    'report',
    'system',
    'vehicle-commissioning',
    'work-order',
    'work-order-requirement',
  ],
  'data-scope': ['rbac'],
  dictionary: ['user'],
  'file-storage': ['system-log'],
  inspection: [
    'data-scope',
    'dept',
    'file-storage',
    'quality-loss',
    'rbac',
    'system-log',
    'task-dispatch',
    'welder',
    'work-order',
  ],
  knowledge: ['file-storage'],
  metrology: ['system-log'],
  planning: ['file-storage', 'inspection', 'system', 'system-log'],
  'quality-loss': [
    'after-sales',
    'data-scope',
    'dept',
    'inspection',
    'system-log',
    'vehicle-commissioning',
  ],
  rbac: ['user'],
  report: [
    'after-sales',
    'dept',
    'inspection',
    'quality-loss',
    'system',
    'vehicle-commissioning',
    'work-order',
  ],
  supervision: ['file-storage'],
  supplier: ['after-sales', 'data-scope', 'inspection', 'system-log'],
  system: ['rbac', 'user'],
  user: ['rbac', 'system-log'],
  'vehicle-commissioning': ['file-storage', 'report', 'system-log'],
  'work-order': [
    'data-scope',
    'file-storage',
    'inspection',
    'system-log',
    'work-order-requirement',
  ],
  'work-order-requirement': ['file-storage', 'work-order'],
};

const depEdges: Edge[] = Object.entries(moduleDeps).flatMap(([src, targets]) =>
  targets.map<Edge>((tgt) => ({
    id: `dep-${src}-${tgt}`,
    source: src,
    target: tgt,
    type: 'arch',
    animated: false,
    data: { kind: 'dep' },
  })),
);

const flowEdges: Edge[] = [
  // Clients → Gateway
  {
    id: 'web-gateway',
    source: 'client-web',
    target: 'api-gateway',
    type: 'arch',
    data: { kind: 'flow' },
  },
  {
    id: 'mobile-gateway',
    source: 'client-mobile',
    target: 'api-gateway',
    type: 'arch',
    data: { kind: 'flow' },
  },
  // Gateway → Middleware
  {
    id: 'gateway-auth',
    source: 'api-gateway',
    target: 'mw-auth',
    type: 'arch',
    data: { kind: 'flow' },
  },
  {
    id: 'gateway-ds',
    source: 'api-gateway',
    target: 'mw-datascope',
    type: 'arch',
    data: { kind: 'flow' },
  },
  // Middleware → entry modules (representative)
  {
    id: 'auth-user',
    source: 'mw-auth',
    target: 'user',
    type: 'arch',
    data: { kind: 'flow' },
    label: 'token',
  },
  {
    id: 'ds-inspection',
    source: 'mw-datascope',
    target: 'inspection',
    type: 'arch',
    data: { kind: 'flow' },
    label: 'scope',
  },
  {
    id: 'ds-after-sales',
    source: 'mw-datascope',
    target: 'after-sales',
    type: 'arch',
    data: { kind: 'flow' },
  },
  {
    id: 'ds-supplier',
    source: 'mw-datascope',
    target: 'supplier',
    type: 'arch',
    data: { kind: 'flow' },
  },
  {
    id: 'ds-work-order',
    source: 'mw-datascope',
    target: 'work-order',
    type: 'arch',
    data: { kind: 'flow' },
  },
  // Modules → infrastructure (representative)
  {
    id: 'inspection-mysql',
    source: 'inspection',
    target: 'infra-mysql',
    type: 'arch',
    data: { kind: 'infra' },
  },
  {
    id: 'work-order-mysql',
    source: 'work-order',
    target: 'infra-mysql',
    type: 'arch',
    data: { kind: 'infra' },
  },
  {
    id: 'after-sales-mysql',
    source: 'after-sales',
    target: 'infra-mysql',
    type: 'arch',
    data: { kind: 'infra' },
  },
  {
    id: 'user-redis',
    source: 'user',
    target: 'infra-redis',
    type: 'arch',
    data: { kind: 'infra' },
    label: 'cache',
  },
  {
    id: 'rbac-redis',
    source: 'rbac',
    target: 'infra-redis',
    type: 'arch',
    data: { kind: 'infra' },
  },
  {
    id: 'file-oss',
    source: 'file-storage',
    target: 'infra-oss',
    type: 'arch',
    data: { kind: 'infra' },
    label: 'upload',
  },
];

export const edges: Edge[] = [...flowEdges, ...depEdges];

export const NODE_DIMENSIONS = { width: NODE_W, height: NODE_H };
