import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '~/modules/user/user.service';
import prisma from '~/utils/prisma';

const { mockBcryptHash } = vi.hoisted(() => ({
  mockBcryptHash: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: mockBcryptHash,
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    users: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    departments: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    roles: {
      findFirst: vi.fn(),
    },
    qms_inspection_requests: {
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'test-cuid-id',
}));

vi.mock('~/utils/jwt-utils', () => ({
  generateAccessToken: vi.fn(() => 'generated-token'),
}));

vi.mock('~/modules/rbac/rbac.service', () => ({
  RbacService: {
    saveUserRoles: vi.fn(),
    getUserRoles: vi.fn(),
    getUserPermissionCodes: vi.fn(),
  },
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: (_table: string, fields: any) => fields,
}));

vi.mock('~/modules/user/user-security', () => ({
  getDefaultResetPassword: () => 'default-pass',
}));

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated users with dept names', async () => {
      (prisma.users.count as any).mockResolvedValue(1);
      (prisma.users.findMany as any).mockResolvedValue([
        {
          id: 'u1',
          username: 'admin',
          realName: 'Admin',
          department: 'dept-1',
          status: 'ACTIVE',
          createdAt: new Date('2024-01-01'),
          roles: { name: 'admin' },
        },
      ]);
      (prisma.qms_inspection_requests.groupBy as any).mockResolvedValue([
        { inspectorId: 'u1', _count: { id: 3 } },
      ]);
      (prisma.departments.findMany as any).mockResolvedValue([
        { id: 'dept-1', name: 'IT Department' },
      ]);

      const result = await UserService.findAll({ page: 1, pageSize: 10 });

      expect(result.total).toBe(1);
      expect(result.items[0].deptName).toBe('IT Department');
      expect(result.items[0].activeTaskCount).toBe(3);
      expect(result.items[0].status).toBe(1);
    });

    it('should handle missing department gracefully', async () => {
      (prisma.users.count as any).mockResolvedValue(1);
      (prisma.users.findMany as any).mockResolvedValue([
        {
          id: 'u1',
          username: 'user',
          realName: 'User',
          department: 'dept-missing',
          status: 'INACTIVE',
          createdAt: null,
          roles: null,
        },
      ]);
      (prisma.qms_inspection_requests.groupBy as any).mockResolvedValue([]);
      (prisma.departments.findMany as any).mockResolvedValue([]);

      const result = await UserService.findAll({ page: 1, pageSize: 10 });

      expect(result.items[0].deptName).toBe('');
      expect(result.items[0].status).toBe(0);
      expect(result.items[0].roles).toEqual([]);
    });

    it('should apply an active role filter to count and list queries', async () => {
      (prisma.users.count as any).mockResolvedValue(0);
      (prisma.users.findMany as any).mockResolvedValue([]);
      (prisma.qms_inspection_requests.groupBy as any).mockResolvedValue([]);
      (prisma.departments.findMany as any).mockResolvedValue([]);

      await UserService.findAll({
        page: 1,
        pageSize: 100,
        roleName: 'QC',
        status: 1,
      });

      const where = {
        isDeleted: false,
        roles: { isDeleted: false, name: 'QC', status: 1 },
        status: 'ACTIVE',
      };
      expect(prisma.users.count).toHaveBeenCalledWith({ where });
      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100, where }),
      );
    });
  });

  describe('create', () => {
    it('should create user with temporary password', async () => {
      mockBcryptHash.mockResolvedValue('hashed-pass');
      (prisma.roles.findFirst as any).mockResolvedValue({ id: 'role-1' });
      (prisma.users.create as any).mockResolvedValue({
        id: 'user-new',
        username: 'newuser',
        department: 'dept-1',
        roleId: 'role-1',
        status: 'ACTIVE',
      });

      const result = await UserService.create({
        username: 'newuser',
        realName: 'New User',
        deptId: 'dept-1',
        status: 1,
        roles: ['role-1'],
      });

      expect(result.id).toBe('user-new');
      expect(result.temporaryPassword).toBeDefined();
      expect(result.status).toBe(1);
    });

    it('should use default user role when no role is selected', async () => {
      mockBcryptHash.mockResolvedValue('hashed-pass');
      (prisma.roles.findFirst as any).mockResolvedValue({ id: 'role-user' });
      (prisma.users.create as any).mockResolvedValue({
        id: 'user-new',
        username: 'newuser',
        department: 'dept-1',
        roleId: 'role-user',
        status: 'INACTIVE',
      });

      const result = await UserService.create({
        username: 'newuser',
        realName: 'New User',
        deptId: 'dept-1',
      });

      expect(result.status).toBe(0);
      expect(prisma.users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ roleId: 'role-user' }),
        }),
      );
    });

    it('should reject create when selected role is invalid', async () => {
      (prisma.roles.findFirst as any).mockResolvedValue(null);

      await expect(
        UserService.create({
          username: 'newuser',
          realName: 'New User',
          deptId: 'dept-1',
          roles: ['missing-role'],
        }),
      ).rejects.toThrow('所选角色不存在或已停用');

      expect(prisma.users.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update user fields and role', async () => {
      const { RbacService } = await import('~/modules/rbac/rbac.service');
      (prisma.roles.findFirst as any).mockResolvedValue({ id: 'role-admin' });
      (prisma.users.update as any).mockResolvedValue({});

      await UserService.update('u1', {
        realName: 'Updated Name',
        roles: ['role-admin'],
        status: 1,
      });

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({
          realName: 'Updated Name',
          roleId: 'role-admin',
          status: 'ACTIVE',
        }),
      });
      expect(RbacService.saveUserRoles).toHaveBeenCalledWith('u1', [
        'role-admin',
      ]);
    });

    it('should update wechatWorkId to null when empty', async () => {
      (prisma.users.update as any).mockResolvedValue({});

      await UserService.update('u1', { wechatWorkId: '' });

      expect(prisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ wechatWorkId: null }),
        }),
      );
    });
  });

  describe('delete', () => {
    it('should soft delete user', async () => {
      (prisma.users.update as any).mockResolvedValue({});

      await UserService.delete('u1');

      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ isDeleted: true }),
      });
    });
  });

  describe('getInfoByTokenPayload', () => {
    it('should return enriched user info', async () => {
      const { RbacService } = await import('~/modules/rbac/rbac.service');
      (prisma.users.findFirst as any).mockResolvedValue({
        id: 'u1',
        realName: 'Admin',
        department: 'dept-1',
        avatar: '/avatar.png',
      });
      (RbacService.getUserRoles as any).mockResolvedValue([{ name: 'admin' }]);
      (RbacService.getUserPermissionCodes as any).mockResolvedValue([
        'read',
        'write',
      ]);
      (prisma.departments.findUnique as any).mockResolvedValue({
        name: 'IT',
      });

      const result = await UserService.getInfoByTokenPayload({
        id: 'u1',
        username: 'admin',
      });

      expect(result.id).toBe('u1');
      expect(result.roles).toEqual(['admin']);
      expect(result.permissions).toEqual(['read', 'write']);
      expect(result.deptName).toBe('IT');
    });

    it('should return null when user not found', async () => {
      (prisma.users.findFirst as any).mockResolvedValue(null);

      const result = await UserService.getInfoByTokenPayload({
        id: 'missing',
        username: 'missing',
      });

      expect(result).toBeNull();
    });
  });

  describe('findInspectors', () => {
    it('should return active users with the inspector role', async () => {
      (prisma.users.findMany as any).mockResolvedValue([
        { id: 'u1', realName: 'Inspector', username: 'insp' },
      ]);

      const result = await UserService.findInspectors();

      expect(result).toHaveLength(1);
      expect(result[0].realName).toBe('Inspector');
      expect(prisma.users.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            roles: { isDeleted: false, name: 'QC', status: 1 },
            status: 'ACTIVE',
          },
        }),
      );
    });
  });

  describe('generateToken', () => {
    it('should generate token with user data', () => {
      const result = UserService.generateToken({
        id: 'u1',
        username: 'admin',
        realName: 'Admin',
        avatar: null,
        roles: { name: 'admin' },
      });

      expect(result).toBe('generated-token');
    });

    it('should use defaults for missing fields', () => {
      const result = UserService.generateToken({
        id: 'u1',
        username: 'admin',
        realName: null,
        avatar: null,
        roles: null,
      });

      expect(result).toBe('generated-token');
    });
  });

  describe('resetPassword', () => {
    it('should hash and update password', async () => {
      mockBcryptHash.mockResolvedValue('new-hashed');
      (prisma.users.update as any).mockResolvedValue({});

      await UserService.resetPassword('u1');

      expect(mockBcryptHash).toHaveBeenCalledWith('default-pass', 12);
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: expect.objectContaining({ password: 'new-hashed' }),
      });
    });
  });
});
