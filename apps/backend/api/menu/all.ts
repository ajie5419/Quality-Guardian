import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { MOCK_MENUS } from '~/utils/mock-data';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // 1. Get current role from token
  const roleId = userinfo.roles?.[0] || 'guest';
  let configUsername = 'guest';

  // 2. Fetch role details from DB to support dynamic role values
  let roleValue = String(roleId).toLowerCase();
  try {
    const roleRecord = await prisma.roles.findUnique({
      where: { id: String(roleId) },
    });
    if (roleRecord) {
      roleValue = (roleRecord.value || roleRecord.name || '').toLowerCase();
    }
  } catch (error) {
    console.error('Failed to fetch role info for menu mapping', error);
  }

  // 3. Define mapping logic based on Role Value or ID
  if (
    roleValue === 'super' ||
    roleValue.includes('admin') ||
    roleId === 'super'
  ) {
    configUsername = 'vben';
  } else if (roleValue === 'user' || roleId === 'user') {
    configUsername = 'jack';
  } else {
    // Fallback: If it's a custom role, default to standard user (jack) menus
    // so that new roles can actually see the QMS system.
    configUsername = 'jack';
  }

  const menus =
    MOCK_MENUS.find((item) => item.username === configUsername)?.menus ?? [];
  return useResponseSuccess(menus);
});
