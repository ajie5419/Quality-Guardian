import bcrypt from 'bcrypt';
import { defineEventHandler, readBody } from 'h3';
import prisma from '~/utils/prisma';
import {
  badRequestResponse,
  conflictResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const { deptId, password, username } = await readBody(event);

  if (!username || !password || !deptId) {
    return badRequestResponse(
      event,
      '用户名、密码和部门均为必填项',
      'BadRequest',
    );
  }

  // 检查部门是否存在
  const dept = await prisma.departments.findUnique({
    where: { id: deptId },
  });

  if (!dept) {
    return badRequestResponse(event, '所选部门不存在', 'BadRequest');
  }

  // 检查用户名是否已存在
  const existingUser = await prisma.users.findUnique({
    where: { username },
  });

  if (existingUser) {
    return conflictResponse(event, '用户名已存在', 'Conflict');
  }

  // 获取默认角色 (user)
  let defaultRole = await prisma.roles.findFirst({
    where: { name: 'user' },
  });

  if (!defaultRole) {
    // 如果没有 user 角色，创建一个
    defaultRole = await prisma.roles.create({
      data: {
        id: 'user-role',
        name: 'user',
        description: '普通用户',
        permissions: '[]',
        status: 1,
      },
    });
  }

  // 获取默认部门
  let defaultDept = await prisma.departments.findFirst({
    where: { parentId: '0' },
  });

  if (!defaultDept) {
    defaultDept = await prisma.departments.create({
      data: {
        id: 'default-dept',
        name: '默认部门',
        parentId: '0',
        status: 1,
        updatedAt: new Date(),
      },
    });
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // 创建用户
  const newUser = await prisma.users.create({
    data: {
      id: `USR-${Date.now()}`,
      username,
      password: hashedPassword,
      realName: username,
      roleId: defaultRole.id,
      department: deptId,
      status: 'INACTIVE', // 默认禁用，需审核
    },
  });

  return useResponseSuccess({
    id: newUser.id,
    username: newUser.username,
    message: '注册成功，请等待管理员审核开通账号',
  });
});
