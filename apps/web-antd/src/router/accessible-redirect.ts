import type { MenuRecordRaw } from '@vben/types';

export const ACCESS_DENIED_PATH = '/403';

type RouteAccessCheck = (path: string) => boolean;

function isInternalPath(path: string) {
  return path.startsWith('/') && !path.startsWith('//');
}

export function findFirstAccessibleMenuPath(
  menus: MenuRecordRaw[],
  isRouteAccessible: RouteAccessCheck,
): string | undefined {
  for (const menu of menus) {
    if (menu.disabled || menu.show === false) continue;

    const childPath = findFirstAccessibleMenuPath(
      menu.children ?? [],
      isRouteAccessible,
    );
    if (childPath) return childPath;

    if (isInternalPath(menu.path) && isRouteAccessible(menu.path)) {
      return menu.path;
    }
  }
}

export function resolveInitialAccessPath(
  preferredPath: string,
  menus: MenuRecordRaw[],
  isRouteAccessible: RouteAccessCheck,
) {
  if (preferredPath !== '/' && isRouteAccessible(preferredPath)) {
    return preferredPath;
  }

  return (
    findFirstAccessibleMenuPath(menus, isRouteAccessible) ?? ACCESS_DENIED_PATH
  );
}
