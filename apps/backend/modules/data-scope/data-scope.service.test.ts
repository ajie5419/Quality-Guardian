import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';
import prisma from '~/utils/prisma';

vi.mock('~/modules/rbac/rbac-config', () => ({
  isDataScopeV2Enabled: () => true,
}));

vi.mock('~/utils/prisma', () => ({
  default: {
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

describe('dataScopeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.departments.findMany as any).mockResolvedValue([]);
    (prisma.users.findFirst as any).mockResolvedValue({
      department: 'dept-a',
      roleId: 'role-1',
    });
    (prisma.rbac_user_roles.findMany as any).mockResolvedValue([
      { roleId: 'role-1' },
    ]);
  });

  it('resolves scope from v2 role policies and deduplicates department ids', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'DEPT', deptIds: '["dept-a","dept-b"]' },
      { scopeType: 'DEPT', deptIds: '["dept-a","dept-c",3]' },
    ]);

    const scope = await DataScopeService.getScopeForModule('u1', 'inspection');

    expect(scope).toEqual({
      deptIds: ['dept-a', 'dept-b', 'dept-c'],
      scopeType: 'DEPT',
    });
  });

  it('falls back to the legacy user role id when no v2 role links exist', async () => {
    (prisma.rbac_user_roles.findMany as any).mockResolvedValueOnce([]);
    (prisma.data_permission_policies.findMany as any).mockResolvedValueOnce([
      { scopeType: 'ALL', deptIds: null },
    ]);

    const scope = await DataScopeService.getScopeForModule('u1', 'supplier');

    expect(prisma.data_permission_policies.findMany).toHaveBeenCalledWith({
      where: {
        roleId: { in: ['role-1'] },
        module: 'supplier',
        isDeleted: false,
      },
      select: { scopeType: true, deptIds: true },
    });
    expect(scope).toEqual({ deptIds: [], scopeType: 'ALL' });
  });

  it('falls back to user department or self scope when policies are unavailable', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValueOnce([]);

    await expect(
      DataScopeService.getScopeForModule('u1', 'inspection'),
    ).resolves.toEqual({ deptIds: ['dept-a'], scopeType: 'DEPT' });

    (prisma.users.findFirst as any).mockResolvedValueOnce({
      department: '',
      roleId: 'role-1',
    });
    (prisma.data_permission_policies.findMany as any).mockResolvedValueOnce([]);

    await expect(
      DataScopeService.getScopeForModule('u1', 'inspection'),
    ).resolves.toEqual({ deptIds: [], scopeType: 'SELF' });
  });

  it('returns department ids and names as unique data-scope candidates', async () => {
    (prisma.departments.findMany as any).mockResolvedValueOnce([
      { name: 'Quality' },
      { name: 'Quality' },
      { name: ' ' },
      { name: null },
    ]);

    const candidates = await DataScopeService.getDeptCandidates([
      'dept-a',
      'dept-b',
    ]);

    expect(candidates).toEqual(['dept-a', 'dept-b', 'Quality']);
    expect(prisma.departments.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['dept-a', 'dept-b'] }, isDeleted: false },
      select: { name: true },
    });
  });

  it('should keep query unchanged for ALL', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'ALL', deptIds: null },
    ]);

    const where = await DataScopeService.buildInspectionWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual({ isDeleted: false });
  });

  it('should inject department filter for DEPT', async () => {
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([
      { scopeType: 'DEPT', deptIds: '["dept-a","dept-b"]' },
    ]);

    const where = await DataScopeService.buildInspectionWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.any(Array),
      }),
    );
  });

  it('should use pre-resolved scope without querying role policies', async () => {
    (prisma.departments.findMany as any).mockResolvedValue([
      { name: 'Quality Dept' },
    ]);

    const where = await DataScopeService.buildInspectionWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
      { scopeType: 'DEPT', deptIds: ['dept-a'] },
    );

    expect(prisma.users.findFirst).not.toHaveBeenCalled();
    expect(prisma.rbac_user_roles.findMany).not.toHaveBeenCalled();
    expect(prisma.data_permission_policies.findMany).not.toHaveBeenCalled();
    expect(where).toEqual({
      AND: [
        { isDeleted: false },
        {
          OR: [
            { responsibleDepartment: { in: ['dept-a', 'Quality Dept'] } },
            { responsibleBU: { in: ['dept-a', 'Quality Dept'] } },
          ],
        },
      ],
    });
  });

  it('should fallback to SELF with username condition', async () => {
    (prisma.users.findFirst as any).mockResolvedValueOnce({
      department: '',
      roleId: 'role-1',
    });
    (prisma.data_permission_policies.findMany as any).mockResolvedValue([]);

    const where = await DataScopeService.buildSupplierWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
    );

    expect(where).toEqual({
      AND: [{ isDeleted: false }, { buyer: 'vben' }],
    });
  });

  it('falls back self scope to department fields when module config requires it', async () => {
    (prisma.departments.findMany as any).mockResolvedValueOnce([
      { name: 'Machining' },
    ]);

    const where = await DataScopeService.buildWorkOrderWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
      { scopeType: 'SELF', deptIds: ['dept-machining'] },
    );

    expect(where).toEqual({
      AND: [
        { isDeleted: false },
        { division: { in: ['dept-machining', 'Machining'] } },
      ],
    });
  });

  it('fails closed for work-order self scope without department candidates', async () => {
    const where = await DataScopeService.buildWorkOrderWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
      { scopeType: 'SELF', deptIds: [] },
    );

    expect(where).toEqual({
      AND: [{ isDeleted: false }, { division: { in: [] } }],
    });
  });

  it('keeps base query for modules without data-scope config', async () => {
    const where = await DataScopeService.buildScopedWhere(
      'unknown-module',
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
      { scopeType: 'SELF', deptIds: [] },
    );

    expect(where).toEqual({ isDeleted: false });
  });

  it('delegates after-sales wrapper to its configured department fields', async () => {
    (prisma.departments.findMany as any).mockResolvedValueOnce([
      { name: 'Service' },
    ]);

    const where = await DataScopeService.buildAfterSalesWhere(
      { isDeleted: false },
      { userId: 'u1', username: 'vben' },
      { scopeType: 'DEPT', deptIds: ['dept-service'] },
    );

    expect(where).toEqual({
      AND: [
        { isDeleted: false },
        {
          OR: [
            { division: { in: ['dept-service', 'Service'] } },
            { feedbackDept: { in: ['dept-service', 'Service'] } },
            { respDept: { in: ['dept-service', 'Service'] } },
          ],
        },
      ],
    });
  });

  it('quality-loss SELF scope filters by createdBy when no department fallback exists', async () => {
    (prisma.departments.findMany as any).mockResolvedValueOnce([]);

    const where = await DataScopeService.buildQualityLossWhere(
      { isDeleted: false },
      { userId: 'u-self', username: 'tester' },
      { scopeType: 'SELF', deptIds: [] },
    );

    expect(where).toEqual({ isDeleted: false });
  });

  it('quality-loss DEPT scope filters by respDept candidates', async () => {
    (prisma.departments.findMany as any).mockResolvedValueOnce([
      { name: 'QA' },
    ]);

    const where = await DataScopeService.buildQualityLossWhere(
      { isDeleted: false },
      { userId: 'u-dept', username: 'tester' },
      { scopeType: 'DEPT', deptIds: ['dept-qa'] },
    );

    expect(where).toEqual({
      AND: [{ isDeleted: false }, { respDept: { in: ['dept-qa', 'QA'] } }],
    });
  });
});
