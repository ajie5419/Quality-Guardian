import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InspectionService } from '~/modules/inspection';
import prisma from '~/utils/prisma';

import { WelderScoreRefreshService } from './welder-score-refresh.service';

vi.mock('~/utils/prisma', () => ({
  default: {
    welders: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('~/modules/inspection', () => ({
  InspectionService: {
    getWelderScoreStats: vi.fn(),
  },
}));

describe('welder score refresh service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a zero summary when no welder ids are provided', async () => {
    const result = await WelderScoreRefreshService.refreshByWelderIds([]);

    expect(result).toEqual({
      deductionIssueCount: 0,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(prisma.welders.findMany).not.toHaveBeenCalled();
  });

  it('returns a zero summary when none of the welder ids match', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([] as never);

    const result = await WelderScoreRefreshService.refreshByWelderIds([
      'missing-1',
    ]);

    expect(result).toEqual({
      deductionIssueCount: 0,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(InspectionService.getWelderScoreStats).not.toHaveBeenCalled();
  });

  it('incrementally refreshes only the requested welders using their names', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
      { id: 'w2', name: 'Bob', score: 12, welderCode: 'W-002' },
    ] as never);
    vi.mocked(InspectionService.getWelderScoreStats).mockResolvedValue([
      {
        responsibleWelder: 'Alice',
        responsibleWelderId: 'w1',
        severity: 'critical',
        _count: { id: 1 },
      },
      {
        responsibleWelder: 'Unknown',
        responsibleWelderId: null,
        severity: 'minor',
        _count: { id: 1 },
      },
    ] as never);
    vi.mocked(prisma.welders.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const result = await WelderScoreRefreshService.refreshByWelderIds([
      'w1',
      'w2',
    ]);

    expect(prisma.welders.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['w1', 'w2'] }, isDeleted: false },
      select: { id: true, name: true, score: true, welderCode: true },
    });
    expect(InspectionService.getWelderScoreStats).toHaveBeenCalledWith({
      welderIds: ['w1', 'w2'],
      welderNames: ['Alice', 'W-001', 'Bob', 'W-002'],
    });
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
      data: { score: 8, updatedAt: expect.any(Date) },
    });
  });

  it('skips updates when the computed score is unchanged', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 8, welderCode: 'W-001' },
    ] as never);
    vi.mocked(InspectionService.getWelderScoreStats).mockResolvedValue([
      {
        responsibleWelder: 'Alice',
        responsibleWelderId: 'w1',
        severity: 'major',
        _count: { id: 2 },
      },
    ] as never);

    const result = await WelderScoreRefreshService.refreshByWelderIds(['w1']);

    expect(result).toEqual({
      deductionIssueCount: 2,
      matchedIssueCount: 2,
      updatedCount: 0,
    });
    expect(prisma.welders.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('performs a full refresh when refreshAll is called', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ] as never);
    vi.mocked(InspectionService.getWelderScoreStats).mockResolvedValue([
      {
        responsibleWelder: 'Alice',
        responsibleWelderId: 'w1',
        severity: 'minor',
        _count: { id: 3 },
      },
    ] as never);
    vi.mocked(prisma.welders.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);

    const result = await WelderScoreRefreshService.refreshAll();

    expect(prisma.welders.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false },
      select: { id: true, name: true, score: true, welderCode: true },
    });
    expect(InspectionService.getWelderScoreStats).toHaveBeenCalledWith();
    expect(result).toEqual({
      deductionIssueCount: 3,
      matchedIssueCount: 3,
      updatedCount: 1,
    });
  });

  it('returns a zero-update summary when no welders exist in a full refresh', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([] as never);
    vi.mocked(InspectionService.getWelderScoreStats).mockResolvedValue([
      {
        responsibleWelder: 'Alice',
        responsibleWelderId: null,
        severity: 'minor',
        _count: { id: 1 },
      },
    ] as never);

    const result = await WelderScoreRefreshService.refreshAll();

    expect(result).toEqual({
      deductionIssueCount: 1,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('resolves a unique responsible welder text to its canonical id', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', welderCode: 'W-001' },
      { id: 'w2', name: 'Bob', welderCode: 'W-002' },
    ] as never);

    const result = await WelderScoreRefreshService.resolveResponsibleWelderId(
      prisma,
      'Alice',
    );

    expect(result).toBe('w1');
  });

  it('returns null for empty or ambiguous responsible welder text', async () => {
    vi.mocked(prisma.welders.findMany).mockResolvedValue([
      { id: 'w1', name: 'Alice', welderCode: 'W-001' },
      { id: 'w2', name: 'Alice', welderCode: 'W-002' },
    ] as never);

    const emptyResult =
      await WelderScoreRefreshService.resolveResponsibleWelderId(prisma, '  ');
    const ambiguousResult =
      await WelderScoreRefreshService.resolveResponsibleWelderId(
        prisma,
        'Alice',
      );

    expect(emptyResult).toBeNull();
    expect(ambiguousResult).toBeNull();
  });
});
