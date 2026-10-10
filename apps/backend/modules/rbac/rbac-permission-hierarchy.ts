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

/**
 * Permission codes that are implied by another granted code rather than
 * stored on the role. Both the menu tree and the permission-code endpoint
 * must apply this, otherwise a page stays hidden while its code is granted.
 */
export const IMPLIED_PERMISSION_CODES: Array<{
  granted: string;
  implied: string;
}> = [
  // Anyone who can list inspection requests may open the request dashboard.
  {
    granted: 'QMS:Inspection:Requests:List',
    implied: 'QMS:Inspection:Dashboard:List',
  },
  // Dispatching or closing a request requires seeing the request list.
  {
    granted: 'QMS:Inspection:Requests:Dispatch',
    implied: 'QMS:Inspection:Requests:List',
  },
  {
    granted: 'QMS:Inspection:Requests:Close',
    implied: 'QMS:Inspection:Requests:List',
  },
];

/** Expands derived page codes so menus and API gates see the same set. */
export function applyImpliedPermissionCodes(codes: string[]): string[] {
  const result = new Set(codes);
  let changed = true;
  // Repeat until stable: an implied code may itself grant another one.
  while (changed) {
    changed = false;
    for (const { granted, implied } of IMPLIED_PERMISSION_CODES) {
      if (result.has(granted) && !result.has(implied)) {
        result.add(implied);
        changed = true;
      }
    }
  }
  return [...result];
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
