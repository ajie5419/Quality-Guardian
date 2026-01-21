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

  // Fetch user and role-based permissions from Database
  try {
    const user = await prisma.users.findUnique({
      where: { id: String(userId) },
      include: {
        roles: true,
      },
    });

    if (!user || !user.roles || !user.roles.permissions) {
      return useResponseSuccess([]);
    }

    let codes: string[] = [];
    try {
      codes = JSON.parse(user.roles.permissions);
    } catch (error) {
      console.error('Failed to parse permissions:', error);
    }

    // Special handling for Super Admin (if needed, or rely on DB data)
    // If the permission is ["*"], it usually implies all access,
    // but the frontend might need specific codes.
    // For now, we trust the DB contains the correct list of codes.

    return useResponseSuccess(codes);
  } catch (error) {
    console.error('Error fetching auth codes:', error);
    return useResponseSuccess([]);
  }
});
