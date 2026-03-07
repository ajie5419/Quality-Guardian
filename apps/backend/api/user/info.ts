import { eventHandler } from 'h3';
import { RbacService } from '~/services/rbac.service';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
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
      let roles: string[] = userinfo.roles || [];
      let permissions: string[] = [];
      const roleRows = await RbacService.getUserRoles(dbUser.id);
      roles = roleRows.map((role) => role.name);
      permissions = await RbacService.getUserPermissionCodes(dbUser.id);

      // Fetch department name
      let deptName = '';
      if (dbUser.department) {
        const dept = await prisma.departments.findUnique({
          where: { id: dbUser.department },
        });
        if (dept) {
          deptName = dept.name;
        }
      }

      // Return updated user info with fresh roles from DB
      return useResponseSuccess({
        ...userinfo,
        id: dbUser.id,
        realName: dbUser.realName || userinfo.realName,
        roles,
        permissions, // Return permissions list
        deptName, // Include department name
        avatar: dbUser.avatar || userinfo.avatar,
      });
    }
  } catch (error) {
    logApiError('info', error);
    // Fall back to token data if DB lookup fails
  }

  return useResponseSuccess(userinfo);
});
