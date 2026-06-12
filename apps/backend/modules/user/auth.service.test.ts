import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '~/modules/user/auth.service';
import prisma from '~/utils/prisma';

const { mockBcryptCompare, mockBcryptHash } = vi.hoisted(() => ({
  mockBcryptCompare: vi.fn(),
  mockBcryptHash: vi.fn(),
}));

vi.mock('bcrypt', () => ({
  default: {
    compare: mockBcryptCompare,
    hash: mockBcryptHash,
  },
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    users: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    departments: {
      findUnique: vi.fn(),
    },
    roles: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'test-cuid',
}));

vi.mock('~/utils/jwt-utils', () => ({
  generateAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(() => 'refresh-token'),
}));

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        id: 'u1',
        username: 'admin',
        password: 'hashed',
        status: 'ACTIVE',
        realName: 'Admin',
        department: 'dept-1',
        roles: { name: 'admin' },
      });
      mockBcryptCompare.mockResolvedValue(true);
      (prisma.departments.findUnique as any).mockResolvedValue({ name: 'IT' });

      const result = await AuthService.login('admin', 'pass');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.userPayload.username).toBe('admin');
      expect(result.userPayload.deptName).toBe('IT');
    });

    it('should throw on non-existent user', async () => {
      (prisma.users.findUnique as any).mockResolvedValue(null);

      await expect(AuthService.login('bad', 'pass')).rejects.toThrow(
        '用户名或密码错误',
      );
    });

    it('should throw on inactive user', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        id: 'u1',
        status: 'INACTIVE',
        roles: { name: 'user' },
      });

      await expect(AuthService.login('user', 'pass')).rejects.toThrow(
        '账号已被禁用，请联系管理员。',
      );
    });

    it('should throw on wrong password', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        id: 'u1',
        status: 'ACTIVE',
        password: 'hashed',
        roles: { name: 'user' },
      });
      mockBcryptCompare.mockResolvedValue(false);

      await expect(AuthService.login('user', 'wrong')).rejects.toThrow(
        '用户名或密码错误',
      );
    });

    it('should use default deptName when department not found', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        id: 'u1',
        username: 'admin',
        password: 'hashed',
        status: 'ACTIVE',
        realName: 'Admin',
        department: 'dept-missing',
        roles: { name: 'admin' },
      });
      mockBcryptCompare.mockResolvedValue(true);
      (prisma.departments.findUnique as any).mockResolvedValue(null);

      const result = await AuthService.login('admin', 'pass');

      expect(result.userPayload.deptName).toBe('');
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new access token for active user', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        id: 'u1',
        realName: 'Admin',
        username: 'admin',
        status: 'ACTIVE',
        roles: { name: 'admin' },
      });

      const result = await AuthService.refreshAccessToken('admin');

      expect(result).toBe('access-token');
    });

    it('should return null for non-existent user', async () => {
      (prisma.users.findUnique as any).mockResolvedValue(null);

      const result = await AuthService.refreshAccessToken('bad');

      expect(result).toBeNull();
    });

    it('should return null for inactive user', async () => {
      (prisma.users.findUnique as any).mockResolvedValue({
        status: 'INACTIVE',
      });

      const result = await AuthService.refreshAccessToken('user');

      expect(result).toBeNull();
    });
  });

  describe('registerUser', () => {
    it('should return error when department not found', async () => {
      (prisma.departments.findUnique as any).mockResolvedValue(null);

      const result = await AuthService.registerUser({
        deptId: 'bad-dept',
        password: 'pass',
        username: 'newuser',
      });

      expect(result).toEqual({ error: 'DEPT_NOT_FOUND' });
    });

    it('should return error when username already exists', async () => {
      (prisma.departments.findUnique as any).mockResolvedValue({ id: 'd1' });
      (prisma.users.findUnique as any).mockResolvedValue({ id: 'existing' });

      const result = await AuthService.registerUser({
        deptId: 'd1',
        password: 'pass',
        username: 'existing',
      });

      expect(result).toEqual({ error: 'USER_EXISTS' });
    });

    it('should create user with default role when role not found', async () => {
      (prisma.departments.findUnique as any).mockResolvedValue({ id: 'd1' });
      (prisma.users.findUnique as any).mockResolvedValue(null);
      (prisma.roles.findFirst as any).mockResolvedValue(null);
      (prisma.roles.create as any).mockResolvedValue({
        id: 'user-role',
        name: 'user',
      });
      mockBcryptHash.mockResolvedValue('hashed-pass');
      (prisma.users.create as any).mockResolvedValue({
        id: 'USR-new',
        username: 'newuser',
      });

      const result = await AuthService.registerUser({
        deptId: 'd1',
        password: 'pass',
        username: 'newuser',
      });

      expect(result.id).toBe('USR-new');
      expect(result.username).toBe('newuser');
      expect(prisma.roles.create).toHaveBeenCalled();
    });

    it('should use existing role when found', async () => {
      (prisma.departments.findUnique as any).mockResolvedValue({ id: 'd1' });
      (prisma.users.findUnique as any).mockResolvedValue(null);
      (prisma.roles.findFirst as any).mockResolvedValue({
        id: 'existing-role',
      });
      mockBcryptHash.mockResolvedValue('hashed-pass');
      (prisma.users.create as any).mockResolvedValue({
        id: 'USR-new',
        username: 'newuser',
      });

      const result = await AuthService.registerUser({
        deptId: 'd1',
        password: 'pass',
        username: 'newuser',
      });

      expect(result.id).toBe('USR-new');
      expect(prisma.roles.create).not.toHaveBeenCalled();
    });
  });
});
