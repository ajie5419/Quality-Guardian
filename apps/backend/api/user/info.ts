import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // Fetch fresh user data from database to get updated roles
  try {
    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(userinfo.id) }, { username: userinfo.username }],
      },
    });

    if (dbUser) {
      // Fetch the role name from the roles table
      let roles: string[] = userinfo.roles || [];

      if (dbUser.roleId) {
        const role = await prisma.roles.findFirst({
          where: { id: dbUser.roleId },
        });
        if (role) {
          // Use the role's name as the role identifier
          roles = [role.name];
        }
      }

      // Return updated user info with fresh roles from DB
      return useResponseSuccess({
        ...userinfo,
        id: dbUser.id,
        realName: dbUser.realName || userinfo.realName,
        roles,
        avatar: dbUser.avatar || userinfo.avatar,
      });
    }
  } catch (error) {
    console.error('Failed to fetch user from DB:', error);
    // Fall back to token data if DB lookup fails
  }

  return useResponseSuccess(userinfo);
});
