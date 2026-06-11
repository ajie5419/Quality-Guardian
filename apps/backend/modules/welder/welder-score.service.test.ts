import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WelderScoreService } from '~/modules/welder/welder-score.service';
import prisma from '~/utils/prisma';

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
    getWelderScoreIssues: vi.fn(),
  },
}));

describe('welderScoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync scores from matched inspection issues', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
      { id: 'w2', name: 'Bob', score: 12, welderCode: 'W-002' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'major' },
      { responsibleWelder: 'Unknown', severity: 'minor' },
    ]);
    (prisma.welders.update as any).mockResolvedValue({} as never);
    (prisma.$transaction as any).mockResolvedValue([] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result.deductionIssueCount).toBe(2);
    expect(result.matchedIssueCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('should return zero counts when no welders exist', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'major' },
    ]);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result).toEqual({
      deductionIssueCount: 1,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('should not update when scores are already correct', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([]);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result).toEqual({
      deductionIssueCount: 0,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
    expect(prisma.welders.update).not.toHaveBeenCalled();
  });

  it('should handle null score as WELDER_SCORE_MAX', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: null, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'minor' },
    ]);
    (prisma.welders.update as any).mockResolvedValue({} as never);
    (prisma.$transaction as any).mockResolvedValue([] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result.matchedIssueCount).toBe(1);
    expect(prisma.welders.update).toHaveBeenCalled();
  });

  it('should match welders by name from responsibleWelder text', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'Alice (W-001)', severity: 'major' },
    ]);
    (prisma.welders.update as any).mockResolvedValue({} as never);
    (prisma.$transaction as any).mockResolvedValue([] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result.matchedIssueCount).toBe(1);
  });

  it('should return zero matched when no issues match any welder', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'UnknownPerson', severity: 'major' },
    ]);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result.matchedIssueCount).toBe(0);
    expect(result.updatedCount).toBe(0);
  });

  it('should handle empty issues list', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([]);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result).toEqual({
      deductionIssueCount: 0,
      matchedIssueCount: 0,
      updatedCount: 0,
    });
  });

  it('should accumulate deductions from multiple issues for same welder', async () => {
    const { InspectionService } = await import('~/modules/inspection');
    (prisma.welders.findMany as any).mockResolvedValue([
      { id: 'w1', name: 'Alice', score: 12, welderCode: 'W-001' },
    ]);
    (InspectionService.getWelderScoreIssues as any).mockResolvedValue([
      { responsibleWelder: 'Alice', severity: 'minor' },
      { responsibleWelder: 'Alice', severity: 'major' },
    ]);
    (prisma.welders.update as any).mockResolvedValue({} as never);
    (prisma.$transaction as any).mockResolvedValue([] as never);

    const result = await WelderScoreService.syncFromInspectionIssues();

    expect(result.deductionIssueCount).toBe(2);
    expect(result.matchedIssueCount).toBe(2);
    expect(result.updatedCount).toBe(1);
  });
});
