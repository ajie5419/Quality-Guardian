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

    // Handle Role: frontend sends 'roles' (array of names/ids) or 'roleIds'
    const rolesArray = body.roles || body.roleIds;
    const roleIdOrName = rolesArray?.[0];

    let finalRoleId = 'ROLE-DEFAULT';

    if (roleIdOrName) {
      const role = await prisma.roles.findFirst({
        where: {
          OR: [{ id: String(roleIdOrName) }, { name: String(roleIdOrName) }],
        },
      });
      if (role) {
        finalRoleId = role.id;
      }
    }

    // Handle Status: Number -> Enum
    const statusEnum = body.status === 1 ? 'ACTIVE' : 'INACTIVE';

    const newUser = await prisma.users.create({
      data: {
        id: `user-${Date.now()}`,
        username: body.username,
        password: '$2a$10$placeholder', // Default password should probably be hashed if used
        realName: body.realName,
        email: body.email || '',
        phone: body.phone || '',
        department: body.deptId || 'Unknown',
        status: statusEnum,
        isDeleted: false,
        roleId: finalRoleId,
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
