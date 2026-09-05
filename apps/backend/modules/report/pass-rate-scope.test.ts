import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  buildInspectionRawScopeSql,
  buildScopedInspectionWhere,
} from './pass-rate-scope';

vi.mock('~/utils/prisma', () => ({
  default: {
    departments: {
      findMany: vi.fn(),
    },
  },
}));

const deptAccess = {
  dataScope: {
    deptIds: ['dept-a'],
    module: 'inspection',
    scopeType: 'DEPT' as const,
  },
  user: { userId: 'u-dept-a', username: 'user-a' },
};

const selfAccess = {
  dataScope: {
    deptIds: [],
    module: 'inspection',
    scopeType: 'SELF' as const,
  },
  user: { userId: 'u-self', username: 'inspector-a' },
};

const allAccess = {
  dataScope: {
    deptIds: [],
    module: 'inspection',
    scopeType: 'ALL' as const,
  },
  user: { userId: 'u-all', username: 'admin' },
};

describe('buildInspectionRawScopeSql', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits no scope fragment for an ALL scope', async () => {
    const sql = await buildInspectionRawScopeSql(allAccess);
    expect(sql).toEqual(Prisma.empty);
  });

  it('propagates department candidates into the raw SQL fragment for DEPT scope', async () => {
    (prisma.departments.findMany as any).mockResolvedValue([
      { name: 'Department A' },
    ]);

    const sql = await buildInspectionRawScopeSql(deptAccess);

    expect(sql.text).toContain('responsibleDepartment IN');
    expect(sql.values).toEqual(expect.arrayContaining(['Department A']));
  });

  it('fails closed to AND 1 = 0 when no department candidate can be resolved', async () => {
    (prisma.departments.findMany as any).mockResolvedValue([]);

    const sql = await buildInspectionRawScopeSql({
      dataScope: {
        deptIds: [],
        module: 'inspection',
        scopeType: 'DEPT' as const,
      },
      user: { userId: 'u-dept-a', username: 'user-a' },
    });

    expect(sql.text).toContain('1 = 0');
  });

  it('scopes raw SQL by inspector identity for SELF scope', async () => {
    const sql = await buildInspectionRawScopeSql(selfAccess);
    expect(sql.text).toContain('inspector =');
    expect(sql.values).toContain('inspector-a');
  });

  it('throws FORBIDDEN when the access context has no resolvable user', async () => {
    await expect(buildInspectionRawScopeSql({} as any)).rejects.toThrow(
      'Analytics access context is missing a user',
    );
    await expect(
      buildInspectionRawScopeSql({ user: {} } as any),
    ).rejects.toThrow('Analytics access context is missing a user');
  });
});

describe('buildScopedInspectionWhere', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('narrows inspections by department for DEPT scope', async () => {
    (prisma.departments.findMany as any).mockResolvedValue([
      { name: 'Department A' },
    ]);

    const where = await buildScopedInspectionWhere(
      { isDeleted: false },
      deptAccess,
    );

    expect(where).toEqual({
      AND: [
        { isDeleted: false },
        {
          OR: [
            { responsibleDepartment: { in: ['dept-a', 'Department A'] } },
            { responsibleBU: { in: ['dept-a', 'Department A'] } },
          ],
        },
      ],
    });
  });

  it('narrows inspections by inspector for SELF scope', async () => {
    const where = await buildScopedInspectionWhere(
      { isDeleted: false },
      selfAccess,
    );

    expect(where).toEqual({
      AND: [
        { isDeleted: false },
        {
          OR: [{ inspector: 'inspector-a' }, { lastEditor: 'inspector-a' }],
        },
      ],
    });
  });

  it('keeps the base where unchanged for ALL scope', async () => {
    const where = await buildScopedInspectionWhere(
      { isDeleted: false },
      allAccess,
    );
    expect(where).toEqual({ isDeleted: false });
  });

  it('throws FORBIDDEN when the access context has no resolvable user', async () => {
    await expect(
      buildScopedInspectionWhere({ isDeleted: false }, {} as any),
    ).rejects.toThrow('Analytics access context is missing a user');
  });
});
