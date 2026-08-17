import type { Prisma } from '@prisma/client';

import { randomBytes } from 'node:crypto';

import { createId } from '@paralleldrive/cuid2';
import { QMS_ROLE_NAMES } from '@qgs/shared';
import bcrypt from 'bcrypt';
import { isRbacReadV2Enabled, RbacService } from '~/modules/rbac';
import { getDefaultResetPassword } from '~/modules/user/user-security';
import { BusinessError } from '~/utils/business-error';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { generateAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';

async function loadInspectorActiveTaskCounts(): Promise<Map<string, number>> {
  const inspection = await import('~/modules/inspection');
  return inspection.getInspectorActiveTaskCounts();
}

export interface UserQueryParams {
  page?: number;
  pageSize?: number;
  roleName?: string;
  status?: number;
}

export interface CreateUserDto {
  username: string;
  realName: string;
  email?: string;
  phone?: string;
  deptId?: string;
  status?: number; // 1: ACTIVE, 0: INACTIVE
  roles?: string[];
  roleIds?: string[];
  wechatWorkId?: string;
}

export interface UpdateUserDto {
  username?: string;
  realName?: string;
  email?: string;
  phone?: string;
  deptId?: string;
  department?: string; // Add this to fix the lint error
  status?: number;
  roles?: string[];
  roleIds?: string[];
  wechatWorkId?: string;
}

function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function buildActiveRoleFilter(roleName: string): Prisma.usersWhereInput {
  const roleWhere: Prisma.rolesWhereInput = {
    isDeleted: false,
    name: roleName,
    status: 1,
  };
  if (!isRbacReadV2Enabled()) return { roles: roleWhere };

  return {
    OR: [
      { rbac_user_roles: { some: { role: roleWhere } } },
      {
        rbac_user_roles: { none: {} },
        roles: roleWhere,
      },
    ],
  };
}

function buildEligibleInspectorWhere(): Prisma.usersWhereInput {
  return {
    isDeleted: false,
    status: 'ACTIVE',
    ...buildActiveRoleFilter(QMS_ROLE_NAMES.INSPECTOR),
  };
}

async function resolveCreateRoleId(roleIds?: string[], roles?: string[]) {
  const roleIdOrName = (roleIds?.[0] || roles?.[0] || '').trim();
  const role = roleIdOrName
    ? await prisma.roles.findFirst({
        where: {
          OR: [{ id: roleIdOrName }, { name: roleIdOrName }],
          isDeleted: false,
        },
      })
    : await prisma.roles.findFirst({
        orderBy: { createdAt: 'asc' },
        where: { isDeleted: false, name: 'user', status: 1 },
      });
  if (!role) {
    throw new BusinessError(
      'INVALID_ROLE',
      roleIdOrName ? '所选角色不存在或已停用' : '请选择有效角色',
      400,
    );
  }
  return role.id;
}

export const UserService = {
  /**
   * Find all users with pagination
   */
  async findAll(params: UserQueryParams) {
    const { page = 1, pageSize = 20, roleName, status } = params;
    const currentPage = Number(page);
    const currentPageSize = Math.min(Number(pageSize), 100);

    const where: Prisma.usersWhereInput = {
      isDeleted: false,
      ...(status === undefined
        ? {}
        : {
            status: status === 1 ? ('ACTIVE' as const) : ('INACTIVE' as const),
          }),
      ...(roleName ? buildActiveRoleFilter(roleName) : {}),
    };

    const [total, users, workload] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        skip: (currentPage - 1) * currentPageSize,
        take: currentPageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: true,
        },
      }),
      // 动态加载：inspection 模块导出链上有文件依赖 user 模块，顶层 import 会形成
      // 模块加载循环（InspectionCoreService TDZ）；函数内加载由 Node/vitest 缓存。
      loadInspectorActiveTaskCounts(),
    ]);

    const workloadMap = workload;

    // Get all departments for deptName lookup
    const departments = await prisma.departments.findMany({
      where: { isDeleted: false },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    // Map to frontend structure
    const result = users.map((user) => ({
      ...user,
      userId: user.id,
      deptId: user.department,
      deptName: deptMap.get(user.department) || '',
      roleIds: [user.roleId],
      roles: user.roles?.name ? [user.roles.name] : [],
      status: user.status === 'ACTIVE' ? 1 : 0,
      activeTaskCount: workloadMap.get(user.id) ?? 0,
      createTime: user.createdAt
        ? new Date(user.createdAt).toLocaleString('zh-CN')
        : '',
      remark: '',
    }));

    return {
      items: result,
      total,
    };
  },

  /**
   * Create a new user
   */
  async create(data: CreateUserDto) {
    const finalRoleId = await resolveCreateRoleId(data.roleIds, data.roles);

    const statusEnum = data.status === 1 ? 'ACTIVE' : 'INACTIVE';
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
    const governedFields = buildGovernedWriteFieldsForTable('users', {
      department: data.deptId || 'Unknown',
      realName: data.realName,
      username: data.username,
    });

    const newUser = await prisma.users.create({
      data: {
        id: `user-${createId()}`,
        username: String(governedFields.username || ''),
        password: hashedPassword,
        realName:
          governedFields.realName === undefined
            ? null
            : String(governedFields.realName),
        wechatWorkId: normalizeOptionalText(data.wechatWorkId),
        email: data.email || '',
        phone: data.phone || '',
        department: String(governedFields.department || 'Unknown'), // governance-allow-direct-name-id
        status: statusEnum,
        isDeleted: false,
        roleId: finalRoleId,
      },
    });

    await RbacService.saveUserRoles(newUser.id, [newUser.roleId]);

    return {
      ...newUser,
      deptId: newUser.department,
      roleIds: [newUser.roleId],
      status: newUser.status === 'ACTIVE' ? 1 : 0,
      temporaryPassword,
    };
  },

  /**
   * Update an existing user
   */
  async update(id: string, data: UpdateUserDto) {
    const governedFields = buildGovernedWriteFieldsForTable('users', {
      department: data.department || data.deptId,
      realName: data.realName,
      username: data.username,
    });
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (governedFields.department !== undefined)
      updateData.department = governedFields.department;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.wechatWorkId !== undefined) {
      updateData.wechatWorkId = normalizeOptionalText(data.wechatWorkId);
    }
    if (governedFields.realName !== undefined)
      updateData.realName = governedFields.realName;
    if (governedFields.username !== undefined)
      updateData.username = governedFields.username;

    // Handle Roles
    const rolesArray = data.roles || data.roleIds;
    if (rolesArray && rolesArray.length > 0) {
      const roleIdOrName = rolesArray[0];
      const role = await prisma.roles.findFirst({
        where: {
          OR: [{ id: String(roleIdOrName) }, { name: String(roleIdOrName) }],
        },
      });
      if (role) {
        updateData.roleId = role.id;
      }
    }

    if (data.status !== undefined) {
      updateData.status = data.status === 1 ? 'ACTIVE' : 'INACTIVE';
    }

    await prisma.users.update({
      where: { id },
      data: updateData,
    });

    if (updateData.roleId) {
      await RbacService.saveUserRoles(id, [String(updateData.roleId)]);
    }
  },

  /**
   * Soft delete a user
   */
  async delete(id: string) {
    await prisma.users.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });
  },

  async getInfoByTokenPayload(userinfo: {
    avatar?: string;
    id?: number | string;
    realName?: string;
    roles?: string[];
    username?: string;
  }) {
    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(userinfo.id) }, { username: userinfo.username }],
      },
    });
    if (!dbUser) return null;
    const roleRows = await RbacService.getUserRoles(dbUser.id);
    const permissions = await RbacService.getUserPermissionCodes(dbUser.id);
    const dept = dbUser.department
      ? await prisma.departments.findUnique({
          where: { id: dbUser.department },
        })
      : null;
    return {
      ...userinfo,
      id: dbUser.id,
      realName: dbUser.realName || userinfo.realName,
      roles: roleRows.map((role) => role.name),
      permissions,
      deptName: dept?.name || '',
      avatar: dbUser.avatar || userinfo.avatar,
    };
  },

  async findInspectors() {
    return prisma.users.findMany({
      where: buildEligibleInspectorWhere(),
      select: { id: true, realName: true, username: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  async findEligibleInspector(identifier: string) {
    return prisma.users.findFirst({
      select: { id: true, wxOpenId: true },
      where: {
        AND: [
          buildEligibleInspectorWhere(),
          { OR: [{ id: identifier }, { username: identifier }] },
        ],
      },
    });
  },

  generateToken(user: {
    avatar?: null | string;
    id: string;
    realName?: null | string;
    roles?: null | { name?: null | string };
    username: string;
  }) {
    return generateAccessToken({
      avatar: user.avatar || '/uploads/avatar-v1.svg',
      id: user.id,
      realName: user.realName || user.username,
      roles: [user.roles?.name || 'user'],
      userId: user.id,
      username: user.username,
    });
  },

  async resetPassword(id: string) {
    const hashedPassword = await bcrypt.hash(getDefaultResetPassword(), 12);
    await prisma.users.update({
      where: { id },
      data: { password: hashedPassword, updatedAt: new Date() },
    });
  },
};
