import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { MOCK_MENU_LIST } from '~/utils/mock-data';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/**
 * Recursively filter menus based on user permission codes
 * Excludes button-type items from the menu tree (they are for permission control only)
 */
function filterMenus(
  menus: any[],
  userCodes: string[],
  skipAuthCheck = false,
): any[] {
  const hasStar = userCodes.includes('*');

  return menus
    .filter((menu) => {
      // 1. Skip button type - they should not appear in navigation menu
      if (menu.type === 'button') {
        return false;
      }

      // 2. If it has an authCode, user must have it (unless skipAuthCheck or user has '*')
      if (
        !skipAuthCheck &&
        !hasStar &&
        menu.authCode &&
        !userCodes.includes(menu.authCode)
      ) {
        return false;
      }

      // 3. If it has children, filter them and see if any remain
      if (menu.children && menu.children.length > 0) {
        const visibleChildren = filterMenus(
          menu.children,
          userCodes,
          skipAuthCheck,
        );
        menu.children = visibleChildren;

        // If it's a catalog (folder) and has no visible children, hide the folder
        if (menu.type === 'catalog' && visibleChildren.length === 0) {
          return false;
        }
      }

      return true;
    })
    .map((menu) => ({ ...menu }));
}

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // 1. Get fresh role information from database (not from token)
  let roleNames: string[] = [];

  try {
    // Find user in database
    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(userinfo.id) }, { username: userinfo.username }],
      },
    });

    if (dbUser && dbUser.roleId) {
      // Fetch the role from database
      const role = await prisma.roles.findFirst({
        where: { id: dbUser.roleId },
      });

      if (role) {
        roleNames = [role.name];
      }
    }
  } catch (error) {
    console.error('Failed to fetch user role from DB:', error);
  }

  // Fallback to token roles if DB lookup fails
  if (roleNames.length === 0) {
    roleNames = userinfo.roles || [];
  }

  // 2. Check for super admin - return all menus (but still filter out buttons)
  // Check both 'super' and 'Super Admin' for compatibility
  if (roleNames.includes('super') || roleNames.includes('Super Admin')) {
    const fullMenuList = structuredClone(MOCK_MENU_LIST);
    const filteredMenus = filterMenus(fullMenuList, [], true); // skipAuthCheck = true
    return useResponseSuccess(filteredMenus);
  }

  // 3. Fetch all permission codes for these roles from DB
  let userPermissions: string[] = [];
  try {
    const roleRecords = await prisma.roles.findMany({
      where: {
        OR: [
          { id: { in: roleNames.map(String) } },
          { name: { in: roleNames.map(String) } },
        ],
      },
    });

    // Aggregate all permissions from all roles
    userPermissions = [
      ...new Set(
        roleRecords.flatMap((role) => {
          try {
            // If permissions is stored as a JSON string, parse it
            const perms =
              typeof role.permissions === 'string'
                ? JSON.parse(role.permissions)
                : role.permissions;
            return Array.isArray(perms) ? perms : [];
          } catch (error) {
            console.error(
              `Failed to parse permissions for role ${role.id}`,
              error,
            );
            return [];
          }
        }),
      ),
    ];
  } catch (error) {
    console.error('Failed to fetch role permissions from DB', error);
  }

  // 4. Dynamic Filtering: Use the full MOCK_MENU_LIST and filter by permissions
  const fullMenuList = structuredClone(MOCK_MENU_LIST);
  const filteredMenus = filterMenus(fullMenuList, userPermissions);

  return useResponseSuccess(filteredMenus);
});
