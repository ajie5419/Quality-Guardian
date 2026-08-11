import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveInspectionRequestIssueResponsibilities } from './inspection-request-responsibility.service';

const mocks = vi.hoisted(() => ({
  departments: vi.fn(),
  departmentSources: vi.fn(),
  suppliers: vi.fn(),
}));

vi.mock('~/modules/dept', () => ({
  DeptService: { findActiveByIdsOrNames: mocks.departments },
}));
vi.mock('~/modules/team', () => ({
  TeamIdentityService: {
    resolveActiveDepartmentSourceIdsByTeamIds: mocks.departmentSources,
  },
}));
vi.mock('~/modules/supplier-identity', () => ({
  SupplierIdentityService: {
    resolveSuppliersByTeamIds: mocks.suppliers,
    resolveSupplierByTeamId: vi.fn(),
  },
}));

describe('inspection request responsibility resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.suppliers.mockResolvedValue(new Map());
    mocks.departmentSources.mockResolvedValue(new Map());
    mocks.departments.mockResolvedValue([]);
  });

  it('uses an active TEAM department source for internal responsibility', async () => {
    mocks.departmentSources.mockResolvedValue(
      new Map([['team-1', ['dept-assembly']]]),
    );
    mocks.departments.mockResolvedValue([
      { id: 'dept-assembly', name: 'Assembly Department' },
    ]);
    await expect(
      resolveInspectionRequestIssueResponsibilities([
        { team: 'Assembly', teamId: 'team-1', processName: 'Welding' },
      ]),
    ).resolves.toEqual([
      expect.objectContaining({
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Assembly Department',
        responsibleDepartmentId: 'dept-assembly',
      }),
    ]);
  });

  it('resolves fixed supplier and outsourcing departments only when exactly one active match exists', async () => {
    mocks.departments.mockResolvedValue([
      { id: 'dept-purchasing', name: '采购部' },
      { id: 'dept-production-a', name: '生产 OBU' },
      { id: 'dept-production-b', name: '生产 OBU' },
    ]);
    mocks.suppliers.mockResolvedValue(
      new Map([['team-1', { id: 'supplier-1', name: 'Outsource A' }]]),
    );
    const result = await resolveInspectionRequestIssueResponsibilities([
      { category: 'INCOMING', supplierId: 'supplier-2', team: 'Supplier B' },
      { processName: 'Welding', team: 'Outsource A', teamId: 'team-1' },
    ]);
    expect(result[0]).toMatchObject({
      responsibilityType: 'SUPPLIER',
      responsibleDepartmentId: 'dept-purchasing',
    });
    expect(result[1]).toMatchObject({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: null,
    });
  });

  it('returns no department ID for missing or ambiguous internal sources', async () => {
    mocks.departmentSources.mockResolvedValue(
      new Map([['team-many', ['dept-a', 'dept-b']]]),
    );
    mocks.departments.mockResolvedValue([
      { id: 'dept-a', name: 'A' },
      { id: 'dept-b', name: 'B' },
    ]);
    const result = await resolveInspectionRequestIssueResponsibilities([
      { team: 'Missing', teamId: 'team-missing' },
      { team: 'Many', teamId: 'team-many' },
    ]);
    expect(result.map((item) => item.responsibleDepartmentId)).toEqual([
      null,
      null,
    ]);
  });
});
