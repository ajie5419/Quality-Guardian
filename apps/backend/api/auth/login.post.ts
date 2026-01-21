import bcrypt from 'bcrypt';
import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import {
  clearRefreshTokenCookie,
  setRefreshTokenCookie,
} from '~/utils/cookie-utils';
import { generateAccessToken, generateRefreshToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  forbiddenResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const { password, username } = await readBody(event);
  if (!password || !username) {
    setResponseStatus(event, 400);
    return useResponseError(
      'BadRequestException',
      'Username and password are required',
    );
  }

  // 1. Try to find user in DB
  let user = await prisma.users.findUnique({
    where: { username },
    include: { roles: true },
  });

  // 2. Auto-seed default admin if not found (Bootstrap)
  if (!user && username === 'vben' && password === '123456') {
    try {
      // Resolve role robustly
      let role = await prisma.roles.findUnique({ where: { id: 'super' } });
      if (!role) {
        role = await prisma.roles.findUnique({
          where: { name: 'Super Admin' },
        });
      }

      const roleConnect = role
        ? { connect: { id: role.id } }
        : {
            create: {
              id: 'super',
              name: 'Super Admin',
              permissions: '["*"]',
              status: 1,
            },
          };

      const hashedPassword = await bcrypt.hash('123456', 12);

      user = await prisma.users.create({
        data: {
          id: 'USR-ADMIN',
          username: 'vben',
          password: hashedPassword,
          realName: 'Vben Admin',
          department: 'IT',
          roles: roleConnect,
        },
        include: { roles: true },
      });
    } catch (error) {
      console.error('Seed error', error);
    }
  }

  // 3. Verify password
  if (!user) {
    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, 'Username or password is incorrect.');
  }

  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    clearRefreshTokenCookie(event);
    return forbiddenResponse(event, 'Username or password is incorrect.');
  }

  // 4. Fetch department name
  let deptName = '';
  if (user.department) {
    const dept = await prisma.departments.findUnique({
      where: { id: user.department },
    });
    if (dept) {
      deptName = dept.name;
    }
  }

  // 5. Construct payload compatible with structure expected by frontend
  const userPayload = {
    avatar: '/uploads/avatar-v1.svg',
    id: user.id,
    realName: user.realName,
    roles: [user.roles?.name || 'user'], // Use role name, not ID
    userId: user.id,
    username: user.username,
    deptName, // Include department name
  };

  const accessToken = generateAccessToken(userPayload as unknown as UserInfo);
  const refreshToken = generateRefreshToken(userPayload as unknown as UserInfo);

  setRefreshTokenCookie(event, refreshToken);

  return useResponseSuccess({
    ...userPayload,
    accessToken,
  });
});
