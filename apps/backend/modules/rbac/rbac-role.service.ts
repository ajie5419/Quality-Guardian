import { createId } from '@paralleldrive/cuid2';
import {
  isRbacReadV2Enabled,
  isRbacSuperMergeAllCodesEnabled,
} from '~/modules/rbac/rbac-config';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const INVISIBLE_PERMISSION_CHARS = /[\u200B-\u200D\uFEFF]/g;

export function uniqueNonEmpty(values: string[]) {
  return [
    ...new Set(
      values
        .map((value) => value.replaceAll(INVISIBLE_PERMISSION_CHARS, '').trim())
        .filter(Boolean),
    ),
  ];
}

export function parseStringArrayJson(raw: null | string) {
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

export const RbacRoleService = {
  async listRoles(page: number, pageSize: number) {
    const [total, roles] = await Promise.all([
      prisma.roles.count({ where: { isDeleted: false } }),
      prisma.roles.findMany({
        where: { isDeleted: false },
        include: {
          rbac_role_permissions: {
            include: { permission: true },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      total,
      items: roles.map((role) => {
        const permissions = uniqueNonEmpty(
          role.rbac_role_permissions.map((link) => link.permission?.code || ''),
        );
        return {
          ...role,
          permissions,
          createTime: role.createdAt
            ? new Date(role.createdAt).toLocaleString('zh-CN')
            : '',
          name: role.description || role.name,
          value: role.name,
          remark: role.description || '',
        };
      }),
    };
  },

  async createRole(data: {
    description?: string;
    name?: string;
    permissions?: string[];
    remark?: string;
    status?: number;
    value?: string;
  }) {
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];
    await redis.delByPattern('qms:menu:*');
    const newRole = await prisma.roles.create({
      data: {
        id: `role-${createId()}`,
        name: String(data.value || data.name || ''),
        description: data.remark || data.description || data.name,
        status: data.status ?? 1,
        isSystem: false,
        isDeleted: false,
      },
    });
    await this.saveRolePermissions(newRole.id, permissions);
    return { ...newRole, permissions };
  },

  async updateRole(
    id: string,
    data: {
      description?: string;
      name?: string;
      permissions?: string[];
      remark?: string;
      status?: number;
      value?: string;
    },
  ) {
    const updateData: Record<string, unknown> = {
      description: data.name || data.remark || data.description,
      updatedAt: new Date(),
    };
    if (data.value) updateData.name = data.value;
    if (data.status !== undefined) updateData.status = data.status;
    await redis.delByPattern('qms:menu:*');
    const role = await prisma.roles.update({ where: { id }, data: updateData });
    if (data.permissions !== undefined) {
      await this.saveRolePermissions(
        role.id,
        Array.isArray(data.permissions) ? data.permissions : [],
      );
    }
  },

  async softDeleteRole(id: string) {
    await redis.delByPattern('qms:menu:*');
    await prisma.roles.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
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

    const rolePermissions = await prisma.rbac_role_permissions.findMany({
      where: { roleId: { in: roleIds } },
      include: { permission: true },
    });
    let codes = uniqueNonEmpty(
      rolePermissions.map((row) => row.permission?.code || ''),
    );

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

    const existingPermissions = await prisma.rbac_permissions.findMany({
      where: { code: { in: uniqueCodes } },
      select: { code: true, id: true },
    });
    const existingCodes = new Set(existingPermissions.map((row) => row.code));

    const missingCodes = uniqueCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length > 0) {
      await prisma.rbac_permissions.createMany({
        data: missingCodes.map((code) => ({
          id: `rbac-perm-${createId()}`,
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
                id: `rbac-rp-${createId()}`,
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
          id: `rbac-ur-${createId()}`,
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
      deptIds: policy?.deptIds ? parseStringArrayJson(policy.deptIds) : [],
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
        id: `rbac-ds-${createId()}`,
        roleId,
        module,
        scopeType,
        deptIds: JSON.stringify(uniqueNonEmpty(deptIds)),
        isDeleted: false,
      },
    });
  },
};
