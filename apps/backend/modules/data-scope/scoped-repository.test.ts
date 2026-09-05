import type { ScopedAccessContext } from '~/modules/data-scope/scoped-repository';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import {
  assertScopedWriteAffected,
  createScopedRepository,
} from '~/modules/data-scope/scoped-repository';
import { InspectionRequestHistoryService } from '~/modules/inspection/inspection-request-history.service';
import prisma from '~/utils/prisma';

vi.mock('~/modules/rbac/rbac-config', () => ({
  isDataScopeV2Enabled: () => true,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    data_permission_policies: {
      findMany: vi.fn(),
    },
    departments: {
      findMany: vi.fn(),
    },
    rbac_user_roles: {
      findMany: vi.fn(),
    },
    users: {
      findFirst: vi.fn(),
    },
  },
}));

// Every row-level protected business domain. A department-A user must never
// be able to read, mutate or delete a department-B record through the scoped
// repository, and an ALL-scope user keeps full access.
const PROTECTED_MODULES = [
  ['inspection'],
  ['after-sales'],
  ['quality-loss'],
  ['supplier'],
  ['work-order'],
  ['task-dispatch'],
] as const;

const DEPT_A_CONTEXT: ScopedAccessContext = {
  scope: { scopeType: 'DEPT', deptIds: ['dept-a'] },
  user: { id: 'user-a', username: 'alice' },
};

describe('data-scope security regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.departments.findMany as any).mockImplementation(
      async (args: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return ids && ids.length > 0 ? [{ name: 'Dept A' }] : [];
      },
    );
    (prisma.users.findFirst as any).mockResolvedValue({
      department: 'dept-a',
      roleId: 'role-1',
    });
    (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
      { roleId: 'role-1' },
    ]);
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'DEPT', deptIds: '["dept-a"]' },
    ]);
  });

  describe('fail-closed scope resolution', () => {
    it('denies with 403 when the resolved scope type is missing', async () => {
      await expect(
        DataScopeService.buildScopedWhere(
          'inspection',
          { id: 'B-record' },
          { userId: 'user-a', username: 'alice' },
          { deptIds: ['dept-a'] },
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('denies with 403 when no data-scope policy exists for the module', async () => {
      await expect(
        DataScopeService.buildScopedWhere(
          'unknown-module',
          { id: 'B-record' },
          { userId: 'user-a', username: 'alice' },
          { scopeType: 'DEPT', deptIds: ['dept-a'] },
        ),
      ).rejects.toMatchObject({ httpStatus: 403 });
    });

    it('never degrades an incomplete scope to full access', async () => {
      // An omitted scope object must not widen the where clause.
      const where = await DataScopeService.buildScopedWhere(
        'inspection',
        { id: 'B-record' },
        { userId: 'user-a', username: 'alice' },
      );
      expect(JSON.stringify(where)).toContain('dept-a');
    });
  });

  describe('cross-department access matrix', () => {
    it.each(PROTECTED_MODULES)(
      '%s: department-A user cannot update a department-B record',
      async (module) => {
        const updateMany = vi.fn().mockResolvedValue({ count: 0 });
        const repo = createScopedRepository(module, {
          updateMany,
        } as any);

        const result = await repo.updateAccessible(
          { where: { id: 'B-record' }, data: { name: 'hijack' } },
          DEPT_A_CONTEXT,
        );

        expect(result.count).toBe(0);
        expect(() =>
          assertScopedWriteAffected(result.count, module),
        ).toThrowError(
          expect.objectContaining({
            httpStatus: 404,
            code: 'NOT_FOUND',
          }),
        );
        const whereArg = updateMany.mock.calls[0]?.[0]?.where;
        expect(whereArg).not.toEqual({ id: 'B-record' });
        expect(JSON.stringify(whereArg)).toContain('dept-a');
      },
    );

    it.each(PROTECTED_MODULES)(
      '%s: department-A user cannot delete a department-B record',
      async (module) => {
        const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
        const repo = createScopedRepository(module, {
          deleteMany,
        } as any);

        const result = await repo.deleteAccessible(
          { where: { id: 'B-record' } },
          DEPT_A_CONTEXT,
        );

        expect(result.count).toBe(0);
        expect(() =>
          assertScopedWriteAffected(result.count, module),
        ).toThrowError(expect.objectContaining({ httpStatus: 404 }));
        expect(JSON.stringify(deleteMany.mock.calls[0]?.[0]?.where)).toContain(
          'dept-a',
        );
      },
    );

    it.each(PROTECTED_MODULES)(
      '%s: department-A user cannot read a department-B record',
      async (module) => {
        const findFirst = vi.fn().mockResolvedValue(null);
        const findMany = vi.fn().mockResolvedValue([]);
        const repo = createScopedRepository(module, {
          findFirst,
          findMany,
        } as any);

        await expect(
          repo.findAccessible({ where: { id: 'B-record' } }, DEPT_A_CONTEXT),
        ).resolves.toBeNull();
        expect(JSON.stringify(findFirst.mock.calls[0]?.[0]?.where)).toContain(
          'dept-a',
        );

        const rows = await repo.findManyAccessible(
          { where: { workOrderNumber: { in: ['B-1', 'B-2'] } } },
          DEPT_A_CONTEXT,
        );
        expect(rows).toEqual([]);
        expect(JSON.stringify(findMany.mock.calls[0]?.[0]?.where)).toContain(
          'dept-a',
        );
      },
    );

    it.each(PROTECTED_MODULES)(
      '%s: ALL-scope user keeps full access across departments',
      async (module) => {
        const updateMany = vi.fn().mockResolvedValue({ count: 1 });
        const findFirst = vi.fn().mockResolvedValue({ id: 'B-record' });
        const repo = createScopedRepository(module, {
          findFirst,
          updateMany,
        } as any);
        const ctx: ScopedAccessContext = {
          scope: { scopeType: 'ALL', deptIds: [] },
          user: { id: 'root', username: 'root' },
        };

        const current = await repo.findAccessible(
          { where: { id: 'B-record' } },
          ctx,
        );
        expect(current).toEqual({ id: 'B-record' });
        const result = await repo.updateAccessible(
          { where: { id: 'B-record' }, data: { status: 'CLOSED' } },
          ctx,
        );
        expect(result.count).toBe(1);
        expect(updateMany.mock.calls[0]?.[0]?.where).toEqual({
          id: 'B-record',
        });
      },
    );
  });

  describe('self-scope identity filters', () => {
    it('binds quality-loss records to createdBy = userId', async () => {
      const where = await DataScopeService.buildScopedWhere(
        'quality-loss',
        { id: 'record-1' },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'SELF', deptIds: [] },
      );
      const text = JSON.stringify(where);
      expect(text).toContain('createdBy');
      expect(text).toContain('user-a');
    });

    it('binds task-dispatch records to assigneeId/assignorId = userId', async () => {
      const where = await DataScopeService.buildScopedWhere(
        'task-dispatch',
        { id: 'task-1' },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'SELF', deptIds: [] },
      );
      const text = JSON.stringify(where);
      expect(text).toContain('assigneeId');
      expect(text).toContain('assignorId');
      expect(text).toContain('user-a');
    });

    it('binds inspection records to inspector/lastEditor = username', async () => {
      const where = await DataScopeService.buildScopedWhere(
        'inspection',
        { id: 'inspection-1' },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'SELF', deptIds: [] },
      );
      const text = JSON.stringify(where);
      expect(text).toContain('inspector');
      expect(text).toContain('alice');
    });

    it('locks work-order self scope without department to an empty division set', async () => {
      const where = await DataScopeService.buildWorkOrderWhere(
        { workOrderNumber: 'WO-1', isDeleted: false },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'SELF', deptIds: [] },
      );
      expect(JSON.stringify(where)).toContain('division');
    });
  });

  describe('cross-module scope inheritance', () => {
    it('supplier history inherits the inspection scope, not the supplier scope', async () => {
      const supplierWhere = await DataScopeService.buildScopedWhere(
        'supplier',
        { id: 'supplier-1', isDeleted: false },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'DEPT', deptIds: ['dept-a'] },
      );
      expect(JSON.stringify(supplierWhere)).toContain('buyer');

      const inspectionWhere = await DataScopeService.buildScopedWhere(
        'inspection',
        { id: 'inspection-1', isDeleted: false },
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'DEPT', deptIds: ['dept-a'] },
      );
      const text = JSON.stringify(inspectionWhere);
      expect(text).toContain('responsibleDepartment');
      expect(text).not.toContain('buyer');
    });
  });

  describe('stats and drill-down scope', () => {
    it('scopes quality-loss trend raw SQL to the caller data scope', async () => {
      const queryRaw = prisma.$queryRaw as any;

      queryRaw.mockResolvedValueOnce([]);
      const { QualityLossService } = await import(
        '~/modules/quality-loss/quality-loss.service'
      );
      await QualityLossService.getTrendData(
        'month',
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'DEPT', deptIds: ['dept-a'] },
      );
      const deptSql = JSON.stringify(queryRaw.mock.calls[0] ?? []);
      expect(deptSql).toContain('respDeptId IN');
      expect(deptSql).toContain('dept-a');

      queryRaw.mockResolvedValueOnce([]);
      await QualityLossService.getTrendData(
        'month',
        { userId: 'user-a', username: 'alice' },
        { scopeType: 'SELF', deptIds: [] },
      );
      const selfSql = JSON.stringify(queryRaw.mock.calls[1] ?? []);
      expect(selfSql).toContain('createdBy');
      expect(selfSql).toContain('user-a');
    });

    it('scopes supplier inspection-request history raw SQL to the caller data scope', async () => {
      const queryRaw = prisma.$queryRaw as any;
      queryRaw.mockResolvedValueOnce([]);
      queryRaw.mockResolvedValueOnce([]);

      await InspectionRequestHistoryService.getSupplierHistoryProjects({
        dataScope: { scopeType: 'DEPT', deptIds: ['dept-a'] },
        identitySource: 'supplier',
        page: 1,
        pageSize: 20,
        supplierId: 'supplier-1',
        teamIds: [],
        userContext: { userId: 'user-a', username: 'alice' },
      });
      const deptSql = JSON.stringify(queryRaw.mock.calls[0] ?? []);
      expect(deptSql).toContain('responsibleDepartment IN');
      expect(deptSql).toContain('dept-a');

      queryRaw.mockReset();
      queryRaw.mockResolvedValueOnce([]);
      queryRaw.mockResolvedValueOnce([]);
      await InspectionRequestHistoryService.getSupplierHistoryProjects({
        dataScope: { scopeType: 'SELF', deptIds: [] },
        identitySource: 'supplier',
        page: 1,
        pageSize: 20,
        supplierId: 'supplier-1',
        teamIds: [],
        userContext: { userId: 'user-a', username: 'alice' },
      });
      const selfSql = JSON.stringify(queryRaw.mock.calls[0] ?? []);
      expect(selfSql).toContain('inspectorId');
      expect(selfSql).toContain('user-a');
    });
  });
});
