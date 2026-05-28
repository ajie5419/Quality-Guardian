import { randomBytes } from 'node:crypto';
import process from 'node:process';

import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcrypt';
import { RbacService } from '~/modules/rbac/rbac.service';
import { getDefaultResetPassword } from '~/modules/user/user-security';
import { buildGovernedWriteFieldsForTable } from '~/utils/governed-write';
import { generateAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';

export interface UserQueryParams {
  page?: number;
  pageSize?: number;
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
}

interface WechatWorkTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
}

interface WechatWorkUserInfoResponse {
  errcode?: number;
  errmsg?: string;
  userid?: string;
}

function generateTemporaryPassword() {
  return randomBytes(18).toString('base64url');
}

export const UserService = {
  /**
   * Find all users with pagination
   */
  async findAll(params: UserQueryParams) {
    const { page = 1, pageSize = 20 } = params;
    const currentPage = Number(page);
    const currentPageSize = Number(pageSize);

    const where = { isDeleted: false };

    const [total, users] = await Promise.all([
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
    ]);

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
    // Handle Role lookup
    const rolesArray = data.roles || data.roleIds;
    const roleIdOrName = rolesArray?.[0];
    let finalRoleId = 'ROLE-DEFAULT';

    if (roleIdOrName) {
      const role = await prisma.roles.findFirst({
        where: {
          OR: [{ id: String(roleIdOrName) }, { name: String(roleIdOrName) }],
        },
      });
      if (role) {
        finalRoleId = role.id;
      }
    }

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

  async findByWechatWorkId(wechatWorkId: string) {
    return prisma.users.findFirst({
      where: {
        isDeleted: false,
        status: 'ACTIVE',
        wechatWorkId,
      },
      include: { roles: true },
    });
  },

  async findWechatWorkDispatchRecipients() {
    const users = await prisma.users.findMany({
      include: { roles: true },
      where: {
        isDeleted: false,
        status: 'ACTIVE',
        wechatWorkId: { not: null },
      },
    });
    return users.filter((user) => {
      const roleName = user.roles?.name?.toLowerCase() || '';
      return (
        roleName.includes('admin') ||
        roleName.includes('dispatch') ||
        roleName.includes('manager') ||
        roleName.includes('schedule')
      );
    });
  },

  async findWechatWorkUserById(id: string) {
    return prisma.users.findFirst({
      select: { realName: true, username: true, wechatWorkId: true },
      where: {
        id,
        isDeleted: false,
        status: 'ACTIVE',
        wechatWorkId: { not: null },
      },
    });
  },

  async getWechatWorkUserId(code: string) {
    const corpId = process.env.WECHAT_WORK_CORP_ID;
    const secret = process.env.WECHAT_WORK_SECRET;
    if (!corpId || !secret) {
      throw new Error('Wechat Work OAuth is not configured');
    }

    const tokenRes = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(
        corpId,
      )}&corpsecret=${encodeURIComponent(secret)}`,
    );
    const tokenData = (await tokenRes.json()) as WechatWorkTokenResponse;
    if (!tokenData.access_token) {
      throw new Error(tokenData.errmsg || 'Failed to get Wechat Work token');
    }

    const userRes = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${encodeURIComponent(
        tokenData.access_token,
      )}&code=${encodeURIComponent(code)}`,
    );
    const userData = (await userRes.json()) as WechatWorkUserInfoResponse;
    if (!userData.userid) {
      throw new Error(userData.errmsg || 'Failed to get Wechat Work user');
    }

    return userData.userid;
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
