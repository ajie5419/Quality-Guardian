// 初始化数据库基础数据脚本
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.warn('开始初始化基础数据...');

  // 1. 创建角色
  console.warn('创建角色...');
  const adminRole = await prisma.roles.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'admin',
      description: '超级管理员',
      status: 1,
      permissions: '["*"]',
      isSystem: true,
    },
  });

  const userRole = await prisma.roles.upsert({
    where: { id: '2' },
    update: {},
    create: {
      id: '2',
      name: 'user',
      description: '普通用户',
      status: 1,
      permissions: '[]',
      isSystem: false,
    },
  });
  console.warn('角色创建完成:', adminRole.name, userRole.name);

  // 2. 创建部门
  console.warn('创建部门...');
  const rootDept = await prisma.departments.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: '总公司',
      parentId: '0',
      sort: 0,
      status: 1,
      updatedAt: new Date(),
    },
  });
  console.warn('部门创建完成:', rootDept.name);

  // 3. 创建用户
  console.warn('创建用户...');

  const adminPassword = await bcrypt.hash('admin', 12);
  const vbenPassword = await bcrypt.hash('123456', 12);

  const adminUser = await prisma.users.upsert({
    where: { id: '1' },
    update: {
      password: adminPassword,
    },
    create: {
      id: '1',
      username: 'admin',
      password: adminPassword,
      realName: '管理员',
      roleId: '1',
      department: '1',
      status: 'ACTIVE',
    },
  });

  const vbenUser = await prisma.users.upsert({
    where: { id: '2' },
    update: {
      password: vbenPassword,
    },
    create: {
      id: '2',
      username: 'vben',
      password: vbenPassword,
      realName: 'Vben',
      roleId: '2',
      department: '1',
      status: 'ACTIVE',
    },
  });
  console.warn('用户创建完成:', adminUser.username, vbenUser.username);

  console.warn('✅ 所有基础数据初始化完成!');
}

main()
  .catch((error) => {
    console.error('初始化失败:', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
