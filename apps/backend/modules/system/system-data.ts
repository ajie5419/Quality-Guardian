import process from 'node:process';

export const SYSTEM_DEPT_LIST = [
  {
    id: '1',
    pid: '0',
    name: '总公司',
    status: 1,
    remark: '总部',
    children: [],
  },
];

export const SYSTEM_ROLE_LIST = [
  {
    id: '1',
    name: '超级管理员',
    value: 'super',
    status: 1,
    remark: '拥有系统所有权限',
    permissions: ['*'],
  },
];

export const SYSTEM_MENU_LIST = [];

export const SYSTEM_USER_LIST = [
  {
    id: '1',
    username: 'vben',
    realName: '超级管理员',
    deptId: '1',
    roles: ['super'],
    status: 1,
  },
];

export const AI_SETTINGS = {
  provider: process.env.AI_PROVIDER || 'deepseek',
  apiKey: process.env.AI_API_KEY || '',
  baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com',
  model: process.env.AI_MODEL || 'deepseek-chat',
  availableModels: [
    'deepseek-chat',
    'deepseek-reasoner',
    'glm-4',
    'glm-4-flash',
    'gpt-3.5-turbo',
    'gpt-4o',
  ],
};
