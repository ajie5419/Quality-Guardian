import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '~/utils/prisma';

import {
  getNetPassRateSummaryByRange,
  getPassRateDrillDownByRange,
} from './pass-rate';

vi.mock('~/utils/prisma', () => ({
  default: {
    $queryRaw: vi.fn(),
    departments: {
      findMany: vi.fn(),
    },
    dictionaries: {
      findMany: vi.fn(),
    },
    inspections: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    quality_records: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    system_settings: {
      findUnique: vi.fn(),
    },
  },
}));

describe('pass-rate quantity rule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.system_settings.findUnique as any).mockResolvedValue(null);
  });

  it('calculates pass rate only by quantity and unqualifiedQuantity', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([
      { passCount: 172n, totalCount: 180n },
    ]);

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
    );

    // totalCount = 100 + 80
    expect(summary.totalCount).toBe(180);
    // passCount = (100-8) + (80-0)
    expect(summary.passCount).toBe(172);
    expect(summary.passRate).toBe(95.56);
  });

  it('calculates issue-source pass rate by deducting issue quantities', async () => {
    (prisma.inspections.aggregate as any).mockResolvedValue({
      _sum: { quantity: 120 },
    });
    (prisma.quality_records.aggregate as any).mockResolvedValue({
      _sum: { quantity: 9 },
    });

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      'issue',
    );

    expect(summary.totalCount).toBe(120);
    expect(summary.passCount).toBe(111);
    expect(summary.passRate).toBe(92.5);
  });

  it('propagates the DEPT scope into the raw SQL aggregate', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([
      { passCount: 50n, totalCount: 60n },
    ]);
    (prisma.departments.findMany as any).mockResolvedValue([
      { name: 'Department A' },
    ]);

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      'inspection',
      {
        dataScope: {
          deptIds: ['dept-a'],
          module: 'inspection',
          scopeType: 'DEPT' as const,
        },
        user: { userId: 'u-dept-a', username: 'user-a' },
      },
    );

    expect(summary.totalCount).toBe(60);
    const call = (prisma.$queryRaw as any).mock.calls[0];
    const sqlFragments = call
      .slice(1)
      .filter(
        (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'text' in (value as { text?: string }),
      ) as Array<{ text: string; values: unknown[] }>;
    expect(
      sqlFragments.some((fragment) =>
        fragment.text.includes('responsibleDepartment IN'),
      ),
    ).toBe(true);
    expect(sqlFragments.flatMap((fragment) => fragment.values)).toEqual(
      expect.arrayContaining(['Department A']),
    );
  });

  it('leaves the raw SQL aggregate unscoped for an ALL scope', async () => {
    (prisma.$queryRaw as any).mockResolvedValue([
      { passCount: 5n, totalCount: 10n },
    ]);

    const summary = await getNetPassRateSummaryByRange(
      new Date('2026-01-01'),
      new Date('2026-12-31'),
      'inspection',
      {
        dataScope: {
          deptIds: [],
          module: 'inspection',
          scopeType: 'ALL' as const,
        },
        user: { userId: 'u-all', username: 'admin' },
      },
    );

    expect(summary.totalCount).toBe(10);
    const call = (prisma.$queryRaw as any).mock.calls[0];
    const sqlFragments = call
      .slice(1)
      .filter(
        (value: unknown) =>
          typeof value === 'object' &&
          value !== null &&
          'text' in (value as { text?: string }),
      ) as Array<{ text: string }>;
    expect(
      sqlFragments.some((fragment) =>
        fragment.text.includes('responsibleDepartment'),
      ),
    ).toBe(false);
  });

  it('deducts legacy issue rows from issue-source drilldown buckets', async () => {
    (prisma.$queryRaw as any)
      .mockResolvedValueOnce([
        {
          category: 'PROCESS',
          incomingType: null,
          incomingTypeId: null,
          processId: 'process-weld',
          processName: '焊接',
          quantity: 100,
          unqualifiedQuantity: 0,
          team: '外协结构',
          teamId: 'team-outsourcing-structure',
        },
        {
          category: 'INCOMING',
          incomingType: '外购件',
          incomingTypeId: null,
          processId: null,
          processName: null,
          quantity: 200,
          unqualifiedQuantity: 0,
          team: null,
          teamId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          category: null,
          inspectionCategory: null,
          inspectionIncomingType: null,
          inspectionIncomingTypeId: null,
          inspectionProcessId: null,
          inspectionProcessName: null,
          inspectionTeam: null,
          inspectionTeamId: null,
          processId: null,
          processName: '焊接',
          quantity: 3,
          responsibleDepartment: '外协结构',
          responsibleDepartmentId: null,
        },
        {
          category: '成品检验',
          inspectionCategory: null,
          inspectionIncomingType: null,
          inspectionIncomingTypeId: null,
          inspectionProcessId: null,
          inspectionProcessName: null,
          inspectionTeam: null,
          inspectionTeamId: null,
          processId: null,
          processName: '成品检验',
          quantity: 5,
          responsibleDepartment: '采购部',
          responsibleDepartmentId: null,
        },
      ]);

    const drillDown = await getPassRateDrillDownByRange(
      new Date('2026-04-01'),
      new Date('2026-04-30'),
      () => 99.85,
      'issue',
    );

    expect(drillDown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: '过程检验',
          passCount: 97,
          passRate: 97,
          process: '外协结构',
          totalCount: 100,
        }),
        expect.objectContaining({
          category: '进货检验',
          passCount: 195,
          passRate: 97.5,
          process: '外购件',
          totalCount: 200,
        }),
      ]),
    );
  });

  it('uses canonical identity bindings when process and team names change', async () => {
    (prisma.system_settings.findUnique as any).mockResolvedValue({
      value: JSON.stringify({
        processIds: { 'process-paint': '外协涂装' },
        teamIds: { 'team-assembly': '组装BU' },
      }),
    });
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        category: 'PROCESS',
        incomingType: null,
        incomingTypeId: null,
        processId: 'process-paint',
        processName: 'Renamed Paint Process',
        quantity: 10,
        unqualifiedQuantity: 0,
        team: 'Legacy Assembly Team',
        teamId: 'team-assembly',
      },
    ]);

    const drillDown = await getPassRateDrillDownByRange(
      new Date('2026-04-01'),
      new Date('2026-04-30'),
      () => 99.85,
    );

    expect(drillDown).toEqual([
      expect.objectContaining({
        passCount: 10,
        process: '外协涂装',
        totalCount: 10,
      }),
    ]);
  });

  it('buckets incoming inspections by the canonical dictionary name', async () => {
    (prisma.dictionaries.findMany as any).mockResolvedValue([
      { dictKey: '机加成品件-外协', id: 'dict-1' },
    ]);
    (prisma.$queryRaw as any).mockResolvedValue([
      {
        category: 'INCOMING',
        incomingType: '机加成品件',
        incomingTypeId: 'dict-1',
        processId: null,
        processName: null,
        quantity: 100,
        unqualifiedQuantity: 10,
        team: null,
        teamId: null,
      },
    ]);

    const drillDown = await getPassRateDrillDownByRange(
      new Date('2026-04-01'),
      new Date('2026-04-30'),
      () => 99.85,
    );

    expect(drillDown).toEqual([
      expect.objectContaining({
        category: '进货检验',
        passCount: 90,
        process: '机加成品件-外协',
        totalCount: 100,
      }),
    ]);
  });
});
