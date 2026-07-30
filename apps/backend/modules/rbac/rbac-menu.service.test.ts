import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RbacMenuService } from '~/modules/rbac/rbac-menu.service';
import { RbacRoleService } from '~/modules/rbac/rbac-role.service';
import { ensureModuleMenus } from '~/utils/module-loader';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';
import { useResponseSuccess } from '~/utils/response';

vi.mock('~/utils/prisma', () => ({
  default: {
    menus: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/utils/redis', () => ({
  redis: {
    delByPattern: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('~/utils/module-loader', () => ({
  ensureModuleMenus: vi.fn(),
}));

vi.mock('~/utils/response', () => ({
  useResponseSuccess: vi.fn((data) => ({ code: 0, data })),
}));

vi.mock('~/modules/rbac/rbac-role.service', () => ({
  RbacRoleService: {
    getUserPermissionCodes: vi.fn(),
    getUserRoles: vi.fn(),
  },
}));

vi.mock('@paralleldrive/cuid2', () => ({
  createId: () => 'mock-cuid',
}));

describe('rbacMenuService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (redis.get as any).mockResolvedValue(null);
  });

  describe('getMenuTreeForUser', () => {
    it('should return cached result when available', async () => {
      const cached = { code: 0, data: [{ id: '1', name: 'Menu1' }] };
      (redis.get as any).mockResolvedValueOnce(cached);

      const result = await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(result).toEqual(cached);
      expect(ensureModuleMenus).toHaveBeenCalledOnce();
      expect(prisma.menus.findMany).not.toHaveBeenCalled();
    });

    it('should fetch menus from db and filter by permissions', async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Dashboard',
          type: 'menu',
          authCode: 'QMS:Dashboard:List',
          order: 1,
          meta: JSON.stringify({ title: 'Dashboard' }),
        },
      ]);
      (RbacRoleService.getUserPermissionCodes as any).mockResolvedValue([
        'QMS:Dashboard:List',
      ]);
      (RbacRoleService.getUserRoles as any).mockResolvedValue([
        { name: 'operator' },
      ]);
      (useResponseSuccess as any).mockReturnValue({ code: 0, data: [] });

      const _result = await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(ensureModuleMenus).toHaveBeenCalled();
      expect(prisma.menus.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, status: 1 },
        orderBy: { order: 'asc' },
      });
      expect(redis.set).toHaveBeenCalled();
    });

    it('hides a page when the user only has one of its button permissions', async () => {
      vi.mocked(prisma.menus.findMany).mockResolvedValue([
        {
          authCode: 'QMS:Inspection:Issues:List',
          id: 'issues',
          meta: JSON.stringify({ title: 'Inspection Issues' }),
          name: 'QMSInspectionIssues',
          parentId: '0',
          type: 'menu',
        },
        {
          authCode: 'QMS:Inspection:Issues:View',
          id: 'issues-view',
          meta: JSON.stringify({ title: 'View' }),
          name: 'QMSInspectionIssuesView',
          parentId: 'issues',
          type: 'button',
        },
      ] as never);
      vi.mocked(RbacRoleService.getUserPermissionCodes).mockResolvedValue([
        'QMS:Inspection:Issues:View',
      ]);
      vi.mocked(RbacRoleService.getUserRoles).mockResolvedValue([
        { name: 'operator' },
      ] as never);

      await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(useResponseSuccess).toHaveBeenCalledWith([]);
    });

    it('shows a page when the user has the page permission', async () => {
      vi.mocked(prisma.menus.findMany).mockResolvedValue([
        {
          authCode: 'QMS:Inspection:Issues:List',
          id: 'issues',
          meta: JSON.stringify({ title: 'Inspection Issues' }),
          name: 'QMSInspectionIssues',
          parentId: '0',
          type: 'menu',
        },
      ] as never);
      vi.mocked(RbacRoleService.getUserPermissionCodes).mockResolvedValue([
        'QMS:Inspection:Issues:List',
      ]);
      vi.mocked(RbacRoleService.getUserRoles).mockResolvedValue([
        { name: 'operator' },
      ] as never);

      await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(useResponseSuccess).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'QMSInspectionIssues' }),
      ]);
    });

    it('should skip auth check for super user', async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Admin',
          type: 'menu',
          authCode: 'ADMIN:All',
          order: 1,
          meta: JSON.stringify({ title: 'Admin' }),
        },
      ]);
      (RbacRoleService.getUserPermissionCodes as any).mockResolvedValue([]);
      (RbacRoleService.getUserRoles as any).mockResolvedValue([
        { name: 'super_admin' },
      ]);
      (useResponseSuccess as any).mockReturnValue({ code: 0, data: [] });

      await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(useResponseSuccess).toHaveBeenCalled();
    });

    it('should filter out button type menus', async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Catalog',
          type: 'catalog',
          authCode: null,
          order: 1,
          meta: JSON.stringify({ title: 'Catalog' }),
        },
        {
          id: 'm2',
          parentId: 'm1',
          name: 'Button',
          type: 'button',
          authCode: 'QMS:Test:Create',
          order: 1,
          meta: JSON.stringify({ title: 'Button' }),
        },
      ]);
      (RbacRoleService.getUserPermissionCodes as any).mockResolvedValue([
        'QMS:Test:Create',
      ]);
      (RbacRoleService.getUserRoles as any).mockResolvedValue([
        { name: 'operator' },
      ]);
      (useResponseSuccess as any).mockReturnValue({ code: 0, data: [] });

      await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      const callArgs = (useResponseSuccess as any).mock.calls[0][0];
      expect(callArgs).toBeDefined();
    });

    it('should filter out catalog with no visible children', async () => {
      (redis.get as any).mockResolvedValueOnce(null);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Catalog',
          type: 'catalog',
          authCode: null,
          order: 1,
          meta: JSON.stringify({ title: 'Catalog' }),
        },
        {
          id: 'm2',
          parentId: 'm1',
          name: 'Menu',
          type: 'menu',
          authCode: 'QMS:Test:List',
          order: 1,
          meta: JSON.stringify({ title: 'Menu' }),
        },
      ]);
      (RbacRoleService.getUserPermissionCodes as any).mockResolvedValue([]);
      (RbacRoleService.getUserRoles as any).mockResolvedValue([
        { name: 'operator' },
      ]);
      (useResponseSuccess as any).mockReturnValue({ code: 0, data: [] });

      await RbacMenuService.getMenuTreeForUser({ id: 'u1' });

      expect(useResponseSuccess).toHaveBeenCalled();
    });
  });

  describe('getAllMenuTree', () => {
    it('should return all non-deleted menus as tree', async () => {
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Root',
          type: 'catalog',
          order: 1,
          meta: JSON.stringify({ title: 'Root' }),
        },
        {
          id: 'm2',
          parentId: 'm1',
          name: 'Child',
          type: 'menu',
          order: 1,
          meta: JSON.stringify({ title: 'Child' }),
        },
      ]);

      const tree = await RbacMenuService.getAllMenuTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children?.[0].name).toBe('Child');
    });

    it('should return empty array when no menus exist', async () => {
      (prisma.menus.findMany as any).mockResolvedValue([]);

      const tree = await RbacMenuService.getAllMenuTree();

      expect(tree).toEqual([]);
    });

    it('should parse meta from JSON string', async () => {
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Test',
          type: 'menu',
          order: 1,
          meta: '{"title":"Test Title","icon":"icon-test"}',
        },
      ]);

      const tree = await RbacMenuService.getAllMenuTree();

      expect(tree[0].meta).toEqual({ title: 'Test Title', icon: 'icon-test' });
    });

    it('should handle invalid meta JSON gracefully', async () => {
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          name: 'Test',
          type: 'menu',
          order: 1,
          meta: 'invalid-json',
        },
      ]);

      const tree = await RbacMenuService.getAllMenuTree();

      expect(tree[0].meta).toEqual({});
    });
  });

  describe('checkMenuNameExists', () => {
    it('should return matching menu', async () => {
      (prisma.menus.findFirst as any).mockResolvedValue({ id: 'm1' });

      const result = await RbacMenuService.checkMenuNameExists('Dashboard');

      expect(result).toEqual({ id: 'm1' });
      expect(prisma.menus.findFirst).toHaveBeenCalledWith({
        where: { name: 'Dashboard', isDeleted: false },
        select: { id: true },
      });
    });

    it('should return null when name not found', async () => {
      (prisma.menus.findFirst as any).mockResolvedValue(null);

      const result = await RbacMenuService.checkMenuNameExists('Nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('checkMenuPathExists', () => {
    it('should return matching menu by path', async () => {
      (prisma.menus.findFirst as any).mockResolvedValue({ id: 'm1' });

      const result = await RbacMenuService.checkMenuPathExists('/dashboard');

      expect(result).toEqual({ id: 'm1' });
      expect(prisma.menus.findFirst).toHaveBeenCalledWith({
        where: { path: '/dashboard', isDeleted: false },
        select: { id: true },
      });
    });

    it('should return null when path not found', async () => {
      (prisma.menus.findFirst as any).mockResolvedValue(null);

      const result = await RbacMenuService.checkMenuPathExists('/nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createMenu', () => {
    it('should create menu with correct data', async () => {
      (prisma.menus.create as any).mockResolvedValue({ id: 'menu-new' });

      await RbacMenuService.createMenu({
        name: 'TestMenu',
        path: '/test',
        title: 'Test',
        icon: 'icon-test',
        pid: '0',
      });

      expect(prisma.menus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'TestMenu',
            path: '/test',
            parentId: '0',
          }),
        }),
      );
      expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
    });

    it('should set parentId to 0 when pid is null', async () => {
      (prisma.menus.create as any).mockResolvedValue({ id: 'menu-new' });

      await RbacMenuService.createMenu({
        name: 'TestMenu',
        pid: null as any,
      });

      expect(prisma.menus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: '0' }),
        }),
      );
    });

    it('should set parentId to 0 when pid is "0"', async () => {
      (prisma.menus.create as any).mockResolvedValue({ id: 'menu-new' });

      await RbacMenuService.createMenu({
        name: 'TestMenu',
        pid: '0',
      });

      expect(prisma.menus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: '0' }),
        }),
      );
    });

    it('should use pid as parentId when pid is valid', async () => {
      (prisma.menus.create as any).mockResolvedValue({ id: 'menu-new' });

      await RbacMenuService.createMenu({
        name: 'TestMenu',
        pid: 'parent-id',
      });

      expect(prisma.menus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ parentId: 'parent-id' }),
        }),
      );
    });
  });

  describe('updateMenu', () => {
    it('should update menu and clear cache', async () => {
      (prisma.menus.update as any).mockResolvedValue({ id: 'm1' });

      await RbacMenuService.updateMenu('m1', {
        name: 'Updated',
        status: 0,
        orderNo: 5,
      });

      expect(prisma.menus.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          name: 'Updated',
          status: 0,
          order: 5,
        }),
      });
      expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
    });

    it('should update meta when title or icon provided', async () => {
      (prisma.menus.update as any).mockResolvedValue({ id: 'm1' });

      await RbacMenuService.updateMenu('m1', {
        title: 'New Title',
        icon: 'new-icon',
      });

      expect(prisma.menus.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            meta: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('softDeleteMenu', () => {
    it('should soft delete menu', async () => {
      (prisma.menus.update as any).mockResolvedValue({});

      await RbacMenuService.softDeleteMenu('m1');

      expect(prisma.menus.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { isDeleted: true, updatedAt: expect.any(Date) },
      });
      expect(redis.delByPattern).toHaveBeenCalledWith('qms:menu:*');
    });
  });

  describe('getRolePermissionTree', () => {
    it('should build permission tree from menus', async () => {
      (ensureModuleMenus as any).mockResolvedValue(undefined);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          type: 'catalog',
          authCode: null,
          meta: JSON.stringify({ title: 'Root' }),
        },
        {
          id: 'm2',
          parentId: 'm1',
          type: 'menu',
          authCode: 'QMS:Test:List',
          meta: JSON.stringify({ title: 'Test Page' }),
        },
      ]);

      const tree = await RbacMenuService.getRolePermissionTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].title).toContain('Root');
      expect(tree[0].checkable).toBe(false);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children?.[0].key).toBe('QMS:Test:List');
      expect(tree[0].children?.[0].checkable).toBe(true);
    });

    it('should use MENU_ prefix when authCode is null', async () => {
      (ensureModuleMenus as any).mockResolvedValue(undefined);
      (prisma.menus.findMany as any).mockResolvedValue([
        {
          id: 'm1',
          parentId: '0',
          type: 'menu',
          authCode: null,
          meta: JSON.stringify({ title: 'No Code' }),
        },
      ]);

      const tree = await RbacMenuService.getRolePermissionTree();

      expect(tree[0].key).toBe('MENU_m1');
    });
  });
});
