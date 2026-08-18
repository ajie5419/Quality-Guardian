import type { Prisma } from '@prisma/client';

import { createId } from '@paralleldrive/cuid2';
import { z } from 'zod';
import {
  isRbacReadV2Enabled,
  isRbacSuperMergeAllCodesEnabled,
} from '~/modules/rbac/rbac-config';
import { findMissingPagePermissions } from '~/modules/rbac/rbac-permission-hierarchy';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const INVISIBLE_PERMISSION_CHARS = /[\u200B-\u200D\uFEFF]/g;
const SUPER_ROLE_KEYWORDS = ['super', 'admin'] as const;

/**
 * In-memory TTL cache for permission codes (60s). Permission changes
 * invalidate the cache through clearPermissionCodesCache, which is called
 * by every role-permission mutation below. Multi-instance deployments may
 * see up to 60s of staleness after a permission change, which is an
 * acceptable trade-off for avoiding 2-3 DB queries per authorized write.
 */
const PERMISSION_CODES_TTL_MS = 60_000;
const permissionCodesCache = new Map<
  string,
  { codes: string[]; expiresAt: number }
>();

export function clearPermissionCodesCache() {
  permissionCodesCache.clear();
}
const roleInputFields = {
  description: z.string().trim().max(191).optional(),
  name: z.string().trim().min(1).max(191).optional(),
  permissions: z.array(z.string().trim().min(1).max(191)).max(1000).optional(),
  remark: z.string().trim().max(191).optional(),
  status: z.number().int().min(0).max(1).optional(),
  value: z.string().trim().min(1).max(191).optional(),
};
const createRoleInputSchema = z
  .object(roleInputFields)
  .refine((data) => Boolean(data.value || data.name), {
    message: 'Role name or value is required',
  });
const updateRoleInputSchema = z
  .object(roleInputFields)
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one role field is required',
  });

type RolePermissionClient = Pick<
  Prisma.TransactionClient,
  'rbac_permissions' | 'rbac_role_permissions'
>;

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

function isSuperRoleName(name: string) {
  const normalized = name.toLowerCase();
  return SUPER_ROLE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function validateRolePermissionCodes(codes: string[]) {
  const uniqueCodes = uniqueNonEmpty(codes);
  const placeholderCode = uniqueCodes.find((code) => code.startsWith('MENU_'));
  if (placeholderCode) {
    throw new BusinessError(
      'INVALID_PERMISSION_CODE',
      `Permission ${placeholderCode} is a menu placeholder and cannot be assigned`,
      400,
    );
  }
  if (uniqueCodes.length === 0) return uniqueCodes;

  const menus = await prisma.menus.findMany({
    where: { isDeleted: false, status: 1 },
    select: {
      authCode: true,
      id: true,
      parentId: true,
      type: true,
    },
  });
  const declaredCodes = new Set<string>();
  for (const menu of menus) {
    if (menu.authCode) declaredCodes.add(menu.authCode);
  }
  const unknownCode = uniqueCodes.find((code) => !declaredCodes.has(code));
  if (unknownCode) {
    throw new BusinessError(
      'INVALID_PERMISSION_CODE',
      `Permission ${unknownCode} is not declared by an active menu`,
      400,
    );
  }
  const firstMissingPermission = findMissingPagePermissions(
    uniqueCodes,
    menus,
  )[0];
  if (firstMissingPermission) {
    throw new BusinessError(
      'INVALID_PERMISSION_HIERARCHY',
      `Permission ${firstMissingPermission.permission} requires page permission ${firstMissingPermission.pagePermission}`,
      400,
    );
  }
  return uniqueCodes;
}

function parseRoleInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new BusinessError(
      'INVALID_ROLE_INPUT',
      parsed.error.issues[0]?.message || 'Invalid role payload',
      400,
    );
  }
  return parsed.data;
}

export function parseCreateRoleInput(input: unknown) {
  return parseRoleInput(createRoleInputSchema, input);
}

export function parseUpdateRoleInput(input: unknown) {
  return parseRoleInput(updateRoleInputSchema, input);
}

async function persistRolePermissions(
  client: RolePermissionClient,
  roleId: string,
  uniqueCodes: string[],
) {
  const existingPermissions = await client.rbac_permissions.findMany({
    where: { code: { in: uniqueCodes } },
    select: { code: true, id: true },
  });
  const existingCodes = new Set(existingPermissions.map((row) => row.code));

  const missingCodes = uniqueCodes.filter((code) => !existingCodes.has(code));
  if (missingCodes.length > 0) {
    await client.rbac_permissions.createMany({
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

  const allPermissions = await client.rbac_permissions.findMany({
    where: { code: { in: uniqueCodes } },
    select: { id: true },
  });
  const permissionIds = allPermissions.map((row) => row.id);

  await client.rbac_role_permissions.deleteMany({ where: { roleId } });
  if (permissionIds.length > 0) {
    await client.rbac_role_permissions.createMany({
      data: permissionIds.map((permissionId) => ({
        id: `rbac-rp-${createId()}`,
        roleId,
        permissionId,
      })),
      skipDuplicates: true,
    });
  }
  clearPermissionCodesCache();
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

  async createRole(input: unknown) {
    const data = parseCreateRoleInput(input);
    const permissions = data.permissions ?? [];
    const validatedPermissions = await validateRolePermissionCodes(permissions);
    const newRole = await prisma.$transaction(async (tx) => {
      const role = await tx.roles.create({
        data: {
          id: `role-${createId()}`,
          name: String(data.value || data.name || ''),
          description: data.remark || data.description || data.name,
          status: data.status ?? 1,
          isSystem: false,
          isDeleted: false,
        },
      });
      await persistRolePermissions(tx, role.id, validatedPermissions);
      return role;
    });
    await redis.delByPattern('qms:menu:*');
    return { ...newRole, permissions: validatedPermissions };
  },

  async updateRole(id: string, input: unknown) {
    const data = parseUpdateRoleInput(input);
    const validatedPermissions =
      data.permissions === undefined
        ? undefined
        : await validateRolePermissionCodes(data.permissions);
    const updateData: Record<string, unknown> = {
      description: data.name || data.remark || data.description,
      updatedAt: new Date(),
    };
    if (data.value) updateData.name = data.value;
    if (data.status !== undefined) updateData.status = data.status;
    await prisma.$transaction(async (tx) => {
      const role = await tx.roles.update({ where: { id }, data: updateData });
      if (validatedPermissions !== undefined) {
        await persistRolePermissions(tx, role.id, validatedPermissions);
      }
    });
    await redis.delByPattern('qms:menu:*');
  },

  async softDeleteRole(id: string) {
    await prisma.roles.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
    await redis.delByPattern('qms:menu:*');
    clearPermissionCodesCache();
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
    const cached = permissionCodesCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.codes;

    const roles = await this.getUserRoles(userId);
    if (roles.length === 0) return [] as string[];

    const roleIds = roles.map((role) => role.id);
    const isSuper = roles.some((role) => isSuperRoleName(role.name));

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

    permissionCodesCache.set(userId, {
      codes,
      expiresAt: Date.now() + PERMISSION_CODES_TTL_MS,
    });
    return codes;
  },

  async getUserIdsByPermissionCode(code: string) {
    const rolePermissions = await prisma.rbac_role_permissions.findMany({
      where: {
        permission: { code, isDeleted: false },
        role: { isDeleted: false, status: 1 },
      },
      select: { roleId: true },
    });
    const roleIds = uniqueNonEmpty(
      rolePermissions.map((row) => String(row.roleId || '')),
    );

    const superRoles = await prisma.roles.findMany({
      where: { isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
    const superRoleIds = superRoles
      .filter((role) => isSuperRoleName(role.name))
      .map((role) => role.id);

    const allRoleIds = uniqueNonEmpty([...roleIds, ...superRoleIds]);
    if (allRoleIds.length === 0) return [] as string[];

    const [v2Links, legacyUsers] = await Promise.all([
      prisma.rbac_user_roles.findMany({
        where: { roleId: { in: allRoleIds } },
        select: { userId: true },
      }),
      prisma.users.findMany({
        where: {
          isDeleted: false,
          roleId: { in: allRoleIds },
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
    ]);

    return uniqueNonEmpty([
      ...v2Links.map((link) => link.userId),
      ...legacyUsers.map((user) => user.id),
    ]);
  },

  async saveRolePermissions(roleId: string, codes: string[]) {
    const uniqueCodes = await validateRolePermissionCodes(codes);
    await prisma.$transaction((tx) =>
      persistRolePermissions(tx, roleId, uniqueCodes),
    );
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
