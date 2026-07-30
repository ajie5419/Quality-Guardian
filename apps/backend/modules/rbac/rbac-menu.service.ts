import { createId } from '@paralleldrive/cuid2';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';
import { useResponseSuccess } from '~/utils/response';

import { RbacRoleService } from './rbac-role.service';

interface Menu {
  id: number | string;
  parentId?: null | number | string;
  name: string;
  type: 'button' | 'catalog' | 'menu';
  authCode?: string;
  order?: number;
  meta?: Record<string, unknown> | string;
  children?: Menu[];
  [key: string]: unknown;
}

type RolePermissionTreeNode = {
  checkable: boolean;
  children?: RolePermissionTreeNode[];
  key: string;
  menuId: string;
  title: string;
  type: string;
};

function parseMenuMeta(meta: Menu['meta']) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return meta;
}

function buildMenuTree(menus: Menu[], parentId: string = '0'): Menu[] {
  return menus
    .filter((menu) => {
      const pid =
        !menu.parentId ||
        menu.parentId === null ||
        menu.parentId === undefined ||
        menu.parentId === '0' ||
        menu.parentId === 0
          ? '0'
          : String(menu.parentId);
      return pid === parentId;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((menu) => {
      const children = buildMenuTree(menus, String(menu.id));
      return {
        ...menu,
        meta: parseMenuMeta(menu.meta),
        children: children.length > 0 ? children : undefined,
      };
    });
}

function menuParentId(menu: { parentId?: null | number | string }) {
  return !menu.parentId ||
    menu.parentId === null ||
    menu.parentId === undefined ||
    menu.parentId === '0' ||
    menu.parentId === 0
    ? '0'
    : String(menu.parentId);
}

function hasMenuAccess(menu: Menu, userCodesSet: Set<string>) {
  const meta = parseMenuMeta(menu.meta);
  if (meta.publicAccess === true) return true;
  if (!menu.authCode) return menu.type !== 'menu';
  return userCodesSet.has(menu.authCode);
}

function filterMenus(
  menus: Menu[],
  userCodesSet: Set<string>,
  skipAuthCheck = false,
): Menu[] {
  return menus
    .filter((menu) => {
      if (menu.type === 'button') return false;
      if (!skipAuthCheck && !hasMenuAccess(menu, userCodesSet)) return false;
      if (menu.children && menu.children.length > 0) {
        const visibleChildren = filterMenus(
          menu.children,
          userCodesSet,
          skipAuthCheck,
        );
        menu.children = visibleChildren;
        if (menu.type === 'catalog' && visibleChildren.length === 0) {
          return false;
        }
      }
      return true;
    })
    .map((menu) => ({ ...menu }));
}

export const RbacMenuService = {
  async getMenuTreeForUser(userinfo: {
    id?: null | number | string;
    userId?: null | number | string;
    username?: null | string;
  }) {
    const userId = userinfo.id ?? userinfo.userId;
    const cacheKey = `qms:menu:${userId}`;
    await ensureModuleMenus();
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const allDbMenus = (await prisma.menus.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { order: 'asc' },
    })) as unknown as Menu[];

    const userPermissions = await RbacRoleService.getUserPermissionCodes(
      String(userId),
    );
    const roles = await RbacRoleService.getUserRoles(String(userId));
    const roleNames = roles.map((role) => role.name || '');
    const isSuper =
      roleNames.some((role) => role.toLowerCase().includes('super')) ||
      userPermissions.includes('*') ||
      userPermissions.includes('["*"]') ||
      userId === '1' ||
      userId === 'USR-ADMIN';

    const filteredMenus = filterMenus(
      buildMenuTree(allDbMenus),
      new Set(userPermissions),
      isSuper,
    );
    const result = useResponseSuccess(filteredMenus);
    await redis.set(cacheKey, result, 3600 * 24);
    return result;
  },

  async getAllMenuTree() {
    const menus = (await prisma.menus.findMany({
      where: { isDeleted: false },
      orderBy: { order: 'asc' },
    })) as unknown as Menu[];
    return buildMenuTree(menus);
  },

  async checkMenuNameExists(name: string) {
    return prisma.menus.findFirst({
      where: { name, isDeleted: false },
      select: { id: true },
    });
  },

  async checkMenuPathExists(path: string) {
    return prisma.menus.findFirst({
      where: { path, isDeleted: false },
      select: { id: true },
    });
  },

  async createMenu(data: {
    component?: string;
    icon?: string;
    meta?: Record<string, unknown>;
    name: string;
    orderNo?: number;
    path?: string;
    pid?: string;
    status?: number;
    title?: string;
    type?: string;
  }) {
    const meta = data.meta || {};
    const orderNo = Number(data.orderNo || meta.orderNo || 0);
    const newMenu = await prisma.menus.create({
      data: {
        id: `menu-${createId()}`,
        parentId:
          data.pid && data.pid !== '0' && data.pid !== 'null' ? data.pid : '0',
        name: data.name,
        path: data.path || '',
        component: data.component || '',
        type: data.type || 'menu',
        order: orderNo,
        status: data.status ?? 1,
        meta: JSON.stringify({
          title: data.title || meta.title,
          icon: data.icon || meta.icon,
          orderNo,
          ...meta,
        }),
        isDeleted: false,
      },
    });
    await redis.delByPattern('qms:menu:*');
    return newMenu;
  },

  async updateMenu(
    id: string,
    data: {
      component?: string;
      icon?: string;
      meta?: Record<string, unknown>;
      name?: string;
      orderNo?: number;
      path?: string;
      status?: number;
      title?: string;
    },
  ) {
    const meta = data.meta || {};
    const orderNo = Number(data.orderNo || meta.orderNo || 0);
    const updateData: Record<string, unknown> = {
      component: data.component,
      name: data.name,
      path: data.path,
      updatedAt: new Date(),
    };
    if (data.status !== undefined) updateData.status = data.status;
    if (data.orderNo !== undefined || meta.orderNo !== undefined) {
      updateData.order = orderNo;
    }
    if (data.meta || data.title || data.icon) {
      updateData.meta = JSON.stringify({
        ...meta,
        icon: data.icon || meta.icon,
        orderNo,
        title: data.title || meta.title,
      });
    }
    await redis.delByPattern('qms:menu:*');
    await prisma.menus.update({ where: { id }, data: updateData });
  },

  async softDeleteMenu(id: string) {
    await redis.delByPattern('qms:menu:*');
    await prisma.menus.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  },

  async getRolePermissionTree() {
    await ensureModuleMenus();
    const allMenus = await prisma.menus.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { order: 'asc' },
    });
    const getTitle = (metaStr: null | string): string => {
      if (!metaStr) return '未命名';
      try {
        const meta = JSON.parse(metaStr);
        return meta.title || '未命名';
      } catch {
        return '未命名';
      }
    };
    const getTypeLabel = (type: string): string => {
      if (type === 'button') return '[按钮]';
      if (type === 'catalog') return '[目录]';
      if (type === 'menu') return '[页面]';
      return '';
    };
    const buildTree = (parentId = '0'): RolePermissionTreeNode[] =>
      allMenus
        .filter((menu) => menuParentId(menu) === String(parentId))
        .map((menu) => {
          const node: RolePermissionTreeNode = {
            checkable: Boolean(menu.authCode),
            title: `${getTypeLabel(menu.type)} ${getTitle(menu.meta)}`,
            key: menu.authCode || `MENU_${String(menu.id)}`,
            menuId: String(menu.id),
            type: menu.type,
          };
          const children = buildTree(String(menu.id));
          if (children.length > 0) node.children = children;
          return node;
        });
    return buildTree('0');
  },
};
