import type { UserSession } from '~/utils/jwt-utils';

import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';

export const AuthService = {
  async login(username: string, pass: string) {
    // 1. Try to find user
    const user = await prisma.users.findUnique({
      where: { username },
      include: { roles: true },
    });

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('账号已被禁用，请联系管理员。');
    }

    const isValid = await bcrypt.compare(pass, user.password);
    if (!isValid) {
      throw new Error('用户名或密码错误');
    }

    // 2. Fetch Department
    let deptName = '';
    if (user.department) {
      const dept = await prisma.departments.findUnique({
        where: { id: user.department },
      });
      if (dept) deptName = dept.name;
    }

    // 3. Payload
    const userPayload: UserSession = {
      avatar: '/uploads/avatar-v1.svg',
      id: user.id,
      realName: user.realName,
      roles: [user.roles?.name || 'user'],
      userId: user.id,
      username: user.username,
      deptName,
    };

    const accessToken = generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken(userPayload);

    return { userPayload, accessToken, refreshToken };
  },

  async refreshAccessToken(username: string) {
    const dbUser = await prisma.users.findUnique({
      where: { username },
      include: { roles: true },
    });
    if (!dbUser || dbUser.status !== 'ACTIVE') {
      return null;
    }
    return generateAccessToken({
      id: dbUser.id,
      realName: dbUser.realName,
      roles: [dbUser.roles?.name || 'user'],
      username: dbUser.username,
    });
  },

  async registerUser(params: {
    deptId: string;
    password: string;
    username: string;
  }) {
    const { deptId, password, username } = params;
    const dept = await prisma.departments.findUnique({ where: { id: deptId } });
    if (!dept) return { error: 'DEPT_NOT_FOUND' as const };
    const existingUser = await prisma.users.findUnique({ where: { username } });
    if (existingUser) return { error: 'USER_EXISTS' as const };

    const defaultRole =
      (await prisma.roles.findFirst({ where: { name: 'user' } })) ||
      (await prisma.roles.create({
        data: {
          id: 'user-role',
          name: 'user',
          description: '普通用户',
          permissions: '[]',
          status: 1,
        },
      }));
    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await prisma.users.create({
      data: {
        id: `USR-${Date.now()}`,
        username,
        password: hashedPassword,
        realName: username,
        roleId: defaultRole.id,
        department: deptId,
        status: 'INACTIVE',
      },
    });
    return {
      id: newUser.id,
      username: newUser.username,
      message: '注册成功，请等待管理员审核开通账号',
    };
  },
};
