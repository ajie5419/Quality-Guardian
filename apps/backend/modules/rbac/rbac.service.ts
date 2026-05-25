import {
  ensureFileCenterMenu,
  ensureInspectionRequestMenu,
  ensureMetrologyMenu,
  ensureSupervisionMenu,
  ensureVehicleCommissioningMenu,
} from '~/utils/menu-bootstrap';
import prisma from '~/utils/prisma';
import {
  isRbacReadV2Enabled,
  isRbacSuperMergeAllCodesEnabled,
} from '~/utils/rbac-config';
import { redis } from '~/utils/redis';
import { useResponseSuccess } from '~/utils/response';

function uniqueNonEmpty(values: string[]) {
  return [...new Set(values.filter((value) => value && value.trim() !== ''))];
}

function parseLegacyPermissions(raw: null | string) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === 'string')
      : [];
  } catch {
    return [] as string[];
  }
}

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

function collectMenuAuthCodes(menu: Menu): string[] {
  const codes: string[] = [];
  if (menu.authCode) codes.push(menu.authCode);
  if (menu.children) {
    for (const child of menu.children) {
      codes.push(...collectMenuAuthCodes(child));
    }
  }
  return codes;
}

function hasMenuAccess(menu: Menu, userCodesSet: Set<string>) {
  const meta = parseMenuMeta(menu.meta);
  if (meta.publicAccess === true) return true;
  if (!menu.authCode && menu.type !== 'menu') return true;
  return collectMenuAuthCodes(menu).some((code) => userCodesSet.has(code));
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

export const RbacService = {
  async getMenuTreeForUser(userinfo: {
    id?: null | number | string;
    userId?: null | number | string;
    username?: null | string;
  }) {
    const userId = userinfo.id ?? userinfo.userId;
    const cacheKey = `qms:menu:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    await ensureFileCenterMenu();
    await ensureVehicleCommissioningMenu();
    await ensureSupervisionMenu();
    await ensureInspectionRequestMenu();
    await ensureMetrologyMenu();

    const allDbMenus = (await prisma.menus.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { order: 'asc' },
    })) as unknown as Menu[];

    const userPermissions = await this.getUserPermissionCodes(String(userId));
    const roles = await this.getUserRoles(String(userId));
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

  async getUserRoles(userId: string) {
    const dbUser = await prisma.users.findFirst({
      where: { id: String(userId), isDeleted: false },
      include: { roles: true },
    });

    if (!dbUser) return [];

    if (!isRbacReadV2Enabled()) {
      return dbUser.roles ? [dbUser.roles] : [];
    }

    const roleLinks = await prisma.rbac_user_roles.findMany({
      where: { userId: dbUser.id },
      include: { role: true },
    });

    const roles = roleLinks.map((link) => link.role).filter(Boolean);
    if (roles.length > 0) {
      return roles;
    }

    return dbUser.roles ? [dbUser.roles] : [];
  },

  async getUserPermissionCodes(userId: string) {
    const roles = await this.getUserRoles(userId);
    if (roles.length === 0) return [] as string[];

    const roleIds = roles.map((role) => role.id);
    const roleNames = roles.map((role) => role.name.toLowerCase());
    const isSuper = roleNames.some(
      (name) => name.includes('super') || name.includes('admin'),
    );

    let codes: string[] = [];

    if (isRbacReadV2Enabled()) {
      const rolePermissions = await prisma.rbac_role_permissions.findMany({
        where: { roleId: { in: roleIds } },
        include: { permission: true },
      });
      codes = uniqueNonEmpty(
        rolePermissions.map((row) => row.permission?.code || ''),
      );
    }

    // Fallback or compatibility merge with legacy JSON codes.
    if (codes.length === 0 || !isRbacReadV2Enabled()) {
      const legacyCodes = uniqueNonEmpty(
        roles.flatMap((role) => parseLegacyPermissions(role.permissions)),
      );
      codes = uniqueNonEmpty([...codes, ...legacyCodes]);
    }

    if (isSuper && isRbacSuperMergeAllCodesEnabled()) {
      const menuCodes = await prisma.menus.findMany({
        where: { authCode: { not: null }, isDeleted: false, status: 1 },
        select: { authCode: true },
      });
      codes = uniqueNonEmpty([
        ...codes,
        ...menuCodes.map((row) => row.authCode || ''),
      ]);
    }

    return codes;
  },

  async saveRolePermissions(roleId: string, codes: string[]) {
    const uniqueCodes = uniqueNonEmpty(codes);
    const permissionsJson = JSON.stringify(uniqueCodes);

    // 双写第一份：旧字段（兼容）
    await prisma.roles.update({
      where: { id: roleId },
      data: { permissions: permissionsJson },
    });

    // 双写第二份：新关系表
    const existingPermissions = await prisma.rbac_permissions.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true, id: true },
    });
    const existingCodes = new Set(existingPermissions.map((row) => row.code));

    const missingCodes = uniqueCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length > 0) {
      await prisma.rbac_permissions.createMany({
        data: missingCodes.map((code) => ({
          id: `rbac-perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code,
          name: code,
          module: code.split(':')[0] || 'QMS',
          isDeleted: false,
        })),
        skipDuplicates: true,
      });
    }

    const allPermissions = await prisma.rbac_permissions.findMany({
      where: { code: { in: uniqueCodes } },
      select: { id: true },
    });
    const permissionIds = allPermissions.map((row) => row.id);

    await prisma.$transaction([
      prisma.rbac_role_permissions.deleteMany({ where: { roleId } }),
      ...(permissionIds.length > 0
        ? [
            prisma.rbac_role_permissions.createMany({
              data: permissionIds.map((permissionId) => ({
                id: `rbac-rp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                roleId,
                permissionId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  },

  async saveUserRoles(userId: string, roleIds: string[]) {
    const uniqueRoleIds = uniqueNonEmpty(roleIds);
    if (uniqueRoleIds.length === 0) return;

    const primaryRoleId = uniqueRoleIds[0] as string;

    // 双写第一份：旧字段 users.roleId
    await prisma.users.update({
      where: { id: userId },
      data: { roleId: primaryRoleId },
    });

    // 双写第二份：新关系表 rbac_user_roles
    await prisma.$transaction([
      prisma.rbac_user_roles.deleteMany({ where: { userId } }),
      prisma.rbac_user_roles.createMany({
        data: uniqueRoleIds.map((roleId) => ({
          id: `rbac-ur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId,
          roleId,
        })),
        skipDuplicates: true,
      }),
    ]);
  },

  async getRoleDataScope(roleId: string, module: string) {
    const policy = await prisma.data_permission_policies.findFirst({
      where: { roleId, module, isDeleted: false },
    });
    return {
      deptIds: policy?.deptIds ? parseLegacyPermissions(policy.deptIds) : [],
      module,
      roleId,
      scopeType: policy?.scopeType || 'SELF',
    };
  },

  async saveRoleDataScope(
    roleId: string,
    module: string,
    scopeType: 'ALL' | 'DEPT' | 'SELF',
    deptIds: string[] = [],
  ) {
    await prisma.data_permission_policies.upsert({
      where: { roleId_module: { roleId, module } },
      update: {
        deptIds: JSON.stringify(uniqueNonEmpty(deptIds)),
        isDeleted: false,
        scopeType,
      },
      create: {
        id: `rbac-ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        roleId,
        module,
        scopeType,
        deptIds: JSON.stringify(uniqueNonEmpty(deptIds)),
        isDeleted: false,
      },
    });
  },
};
