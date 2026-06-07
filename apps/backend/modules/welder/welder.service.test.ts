import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import { WelderService } from '~/modules/welder/welder.service';
import prisma from '~/utils/prisma';

vi.mock('~/utils/prisma', () => ({
  default: {
    _runtimeDataModel: {
      models: {
        welders: {
          fields: [
            { name: 'welderCode' },
            { name: 'employmentStatus' },
            { name: 'examDate' },
          ],
        },
      },
    },
    welders: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getWelderScoreIssues: vi.fn(),
  },
}));

vi.mock('~/utils/team-resolver', () => ({
  buildTeamContainsWhere: vi.fn(async ({ keyword }) => ({
    team: { contains: keyword },
  })),
  resolveTeamIdForWrite: vi.fn(async ({ team }) =>
    team ? `team-${team}` : null,
  ),
}));

vi.mock('~/utils/governed-write', () => ({
  buildGovernedWriteFieldsForTable: () => ({ teamCanonicalId: 'team-canon' }),
}));

describe('welderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates welder using normalized write payload', async () => {
    vi.mocked(prisma.welders.create).mockResolvedValue({
      id: 'welder-1',
    } as never);

    await WelderService.create({
      name: 'Alice',
      team: 'A',
      welderCode: 'W-001',
    });

    expect(prisma.welders.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Alice',
        teamId: 'team-A',
        teamCanonicalId: 'team-canon',
        welderCode: 'W-001',
      }),
    });
  });

  it('rejects create when required welder fields are missing', async () => {
    await expect(WelderService.create({ name: '', team: '' })).rejects.toThrow(
      'MISSING_REQUIRED',
    );
    expect(prisma.welders.create).not.toHaveBeenCalled();
  });

  it('updates welder with normalized partial data', async () => {
    await WelderService.update('welder-1', {
      name: 'Alice',
      team: 'A',
    });

    expect(prisma.welders.update).toHaveBeenCalledWith({
      where: { id: 'welder-1' },
      data: expect.objectContaining({
        name: 'Alice',
        teamId: 'team-A',
        teamCanonicalId: 'team-canon',
      }),
    });
  });

  it('soft deletes welder', async () => {
    await WelderService.softDelete('welder-1');

    expect(prisma.welders.update).toHaveBeenCalledWith({
      where: { id: 'welder-1' },
      data: { isDeleted: true, updatedAt: expect.any(Date) },
    });
  });

  it('finds welders with keyword/team filters and returns dashboard stats', async () => {
    vi.mocked(prisma.welders.count)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(8 as never)
      .mockResolvedValueOnce(7 as never)
      .mockResolvedValueOnce(2 as never);
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { certificationNo: null, id: 'welder-1', name: 'Alice' },
    ] as never);
    vi.mocked(prisma.welders.aggregate).mockResolvedValue({
      _avg: { score: 8.25 },
    } as never);

    const result = await WelderService.findAll({
      keyword: 'A',
      page: 2,
      pageSize: 5,
      team: 'Welding',
      welderCode: 'W-1',
    });

    expect(result).toEqual({
      items: [{ certificationNo: null, id: 'welder-1', name: 'Alice' }],
      stats: {
        averageScore: '8.3',
        certifiedCount: 8,
        examPassedCount: 7,
        total: 10,
        warningCount: 2,
      },
      total: 1,
    });
    expect(prisma.welders.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: expect.objectContaining({
          isDeleted: false,
          team: { contains: 'Welding' },
          welderCode: { contains: 'W-1' },
          OR: expect.arrayContaining([
            { welderCode: { contains: 'A' } },
            { name: { contains: 'A' } },
            { certificationNo: { contains: 'A' } },
          ]),
        }),
      }),
    );
  });

  it('imports rows with upsert by welder code and reports invalid rows', async () => {
    vi.mocked(prisma.welders.upsert).mockResolvedValue({} as never);

    const result = await WelderService.importRows([
      { name: 'Alice', team: 'A', welderCode: 'W-001' },
      { name: '', team: '' },
    ]);

    expect(result).toEqual({
      rowErrors: [
        {
          key: '',
          reason: '缺少必填字段: name/team',
          row: 2,
        },
      ],
      successCount: 1,
      totalCount: 2,
    });
    expect(prisma.welders.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          name: 'Alice',
          teamId: 'team-A',
          welderCode: 'W-001',
        }),
        update: expect.objectContaining({
          isDeleted: false,
          teamId: 'team-A',
          updatedAt: expect.any(Date),
        }),
        where: { welderCode: 'W-001' },
      }),
    );
  });

  it('syncs welder scores from matched inspection issues', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
      { id: 'w2', name: 'Bob', score: 12, welderCode: 'W-002' },
    ] as never);
    vi.mocked(InspectionService.getWelderScoreIssues).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'major' },
      { responsibleWelder: 'Unknown', severity: 'minor' },
    ] as never);
    vi.mocked(prisma.welders.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result).toEqual({
      deductionIssueCount: 2,
      matchedIssueCount: 1,
      updatedCount: 1,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
    ]);
    expect(prisma.welders.update).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { score: expect.any(Number), updatedAt: expect.any(Date) },
    });
  });

  it('returns score sync summary without updates when no welders exist', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    vi.mocked(prisma.welders.findMany).mockResolvedValue([] as never);
    vi.mocked(InspectionService.getWelderScoreIssues).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'major' },
    ] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result).toEqual({
      deductionIssueCount: 1,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
