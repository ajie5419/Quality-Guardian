import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const userId = userinfo.userId || userinfo.id;

  if (!userId) {
    return useResponseSuccess([]);
  }

  // Fetch user and role-based permissions from Database (fresh data, not from token)
  try {
    // First find the user to get their current roleId
    const user = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(userId) }, { username: userinfo.username }],
      },
    });

    if (!user || !user.roleId) {
      return useResponseSuccess([]);
    }

    // Fetch the role with its permissions
    const role = await prisma.roles.findFirst({
      where: { id: user.roleId },
    });

    if (!role || !role.permissions) {
      return useResponseSuccess([]);
    }

    // Check for super admin role or '*' permission
    let codes: string[] = [];
    try {
      codes = JSON.parse(role.permissions);
    } catch (error) {
      console.error('Failed to parse permissions:', error);
    }

    if (
      role.name === 'super' ||
      role.name === 'Super Admin' ||
      codes.includes('*')
    ) {
      // Return all permissions
      const { MOCK_CODES } = await import('~/utils/mock-data');
      const superCodes = MOCK_CODES.find((c) => c.username === 'vben');
      return useResponseSuccess(superCodes?.codes || []);
    }

    return useResponseSuccess(codes);
  } catch (error) {
    console.error('Error fetching auth codes:', error);
    return useResponseSuccess([]);
  }
});
