export interface PermissionMenuNode {
  authCode?: null | string;
  id: number | string;
  parentId?: null | number | string;
  type: string;
}

export interface MissingPagePermission {
  pagePermission: string;
  permission: string;
}

export function getPagePermissionRequirements(
  menus: PermissionMenuNode[],
): MissingPagePermission[] {
  const menuById = new Map(menus.map((menu) => [String(menu.id), menu]));
  const requirements = new Map<string, MissingPagePermission>();

  for (const menu of menus) {
    if (menu.type !== 'button' || !menu.authCode) continue;

    const visited = new Set<string>();
    let parentId = menu.parentId ? String(menu.parentId) : '';
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = menuById.get(parentId);
      if (!parent) break;
      if (parent.type === 'menu') {
        if (parent.authCode) {
          requirements.set(`${menu.authCode}:${parent.authCode}`, {
            pagePermission: parent.authCode,
            permission: menu.authCode,
          });
        }
        break;
      }
      parentId = parent.parentId ? String(parent.parentId) : '';
    }
  }

  return [...requirements.values()];
}

export function findMissingPagePermissions(
  permissionCodes: string[],
  menus: PermissionMenuNode[],
): MissingPagePermission[] {
  const selectedCodes = new Set(permissionCodes);
  return getPagePermissionRequirements(menus).filter(
    ({ pagePermission, permission }) =>
      selectedCodes.has(permission) && !selectedCodes.has(pagePermission),
  );
}
