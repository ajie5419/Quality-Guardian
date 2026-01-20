import { defineEventHandler, readBody } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  try {
    const body = await readBody(event);

    // Handle Role: current DB supports single roleId. Pick first one.
    // Also need to ensure role exists? Prisma will throw FK error if not.
    const roleId = body.roleIds?.[0];

    if (!roleId) {
      // If no role provided, maybe use default? Or throw?
      // For now require it or handle failure.
    }

    // Handle Status: Number -> Enum
    // 1 -> ACTIVE, 0 -> INACTIVE
    const statusEnum = body.status === 1 ? 'ACTIVE' : 'INACTIVE';

    const newUser = await prisma.users.create({
      data: {
        id: `user-${Date.now()}`,
        username: body.username,
        password: '$2a$10$placeholder',
        realName: body.realName,
        email: body.email || '',
        phone: body.phone || '',
        department: body.deptId || 'Unknown',
        status: statusEnum,
        isDeleted: false,
        roles: roleId
          ? {
              connect: { id: roleId },
            }
          : {
              connectOrCreate: {
                where: { id: 'ROLE-DEFAULT' },
                create: {
                  id: 'ROLE-DEFAULT',
                  name: 'Default User',
                  permissions: '[]',
                },
              },
            },
      },
    });

    // Return mapped user
    return useResponseSuccess({
      ...newUser,
      deptId: newUser.department,
      roleIds: [newUser.roleId],
      status: newUser.status === 'ACTIVE' ? 1 : 0,
    });
  } catch (error) {
    console.error('Failed to create user:', error);
    if (String(error).includes('Unique constraint')) {
      return useResponseError('用户名已存在');
    }
    return useResponseError('创建用户失败');
  }
});
