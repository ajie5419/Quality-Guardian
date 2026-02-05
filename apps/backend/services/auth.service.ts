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
      throw new Error('Username or password is incorrect.');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('账号已被禁用，请联系管理员。');
    }

    const isValid = await bcrypt.compare(pass, user.password);
    if (!isValid) {
      throw new Error('Username or password is incorrect.');
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
};
