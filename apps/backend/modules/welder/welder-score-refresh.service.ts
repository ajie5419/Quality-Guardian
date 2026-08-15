import {
  clampWelderScore,
  resolveWelderIdByResponsibleText,
  resolveWelderSeverityDeduction,
} from '@qgs/shared';
import prisma from '~/utils/prisma';

export const ALL_WELDERS_SENTINEL = '__ALL__';

const WELDER_SCORE_MAX = 12;

export interface WelderScoreSyncSummary {
  deductionIssueCount: number;
  matchedIssueCount: number;
  updatedCount: number;
}

interface WelderCandidate {
  id: string;
  name: string;
  score: null | number;
  welderCode: null | string;
}

interface WelderScoreStat {
  responsibleWelder: string;
  severity: string;
  _count: { id: number };
}

const EMPTY_SUMMARY: WelderScoreSyncSummary = {
  deductionIssueCount: 0,
  matchedIssueCount: 0,
  updatedCount: 0,
};

function uniqueIds(values: Array<null | string | undefined>): string[] {
  return [
    ...new Set(
      values.map((value) => String(value || '').trim()).filter(Boolean),
    ),
  ];
}

function issueCount(stats: WelderScoreStat[]) {
  return stats.reduce((sum, stat) => sum + stat._count.id, 0);
}

async function applyDeductions(
  welders: WelderCandidate[],
  stats: WelderScoreStat[],
): Promise<WelderScoreSyncSummary> {
  const deductionByWelder = new Map<string, number>();
  let matchedIssueCount = 0;
  for (const stat of stats) {
    const welderId = resolveWelderIdByResponsibleText({
      responsibleWelder: stat.responsibleWelder,
      welderCandidates: welders,
    });
    if (!welderId) continue;
    const count = stat._count.id;
    matchedIssueCount += count;
    const current = deductionByWelder.get(welderId) || 0;
    deductionByWelder.set(
      welderId,
      current + resolveWelderSeverityDeduction(stat.severity) * count,
    );
  }

  const updateOps: Array<ReturnType<typeof prisma.welders.update>> = [];
  for (const welder of welders) {
    const deduction = deductionByWelder.get(welder.id) || 0;
    const nextScore = clampWelderScore(WELDER_SCORE_MAX - deduction);
    const currentScore = Number.isFinite(welder.score)
      ? Number(welder.score)
      : WELDER_SCORE_MAX;
    if (currentScore === nextScore) continue;
    updateOps.push(
      prisma.welders.update({
        where: { id: welder.id },
        data: { score: nextScore, updatedAt: new Date() },
      }),
    );
  }

  if (updateOps.length > 0) await prisma.$transaction(updateOps);
  return {
    deductionIssueCount: issueCount(stats),
    matchedIssueCount,
    updatedCount: updateOps.length,
  };
}

export const WelderScoreRefreshService = {
  async refreshByWelderIds(
    welderIds: Array<null | string | undefined>,
  ): Promise<WelderScoreSyncSummary> {
    const ids = uniqueIds(welderIds);
    if (ids.length === 0) return { ...EMPTY_SUMMARY };

    const { InspectionService } = await import('~/modules/inspection');
    const welders = await prisma.welders.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, name: true, score: true, welderCode: true },
    });
    if (welders.length === 0) return { ...EMPTY_SUMMARY };

    const names = [
      ...new Set(
        welders
          .flatMap((welder) => [welder.name, welder.welderCode])
          .filter(Boolean),
      ),
    ];
    const stats = await InspectionService.getWelderScoreStats(names);
    return applyDeductions(welders, stats);
  },

  async refreshAll(): Promise<WelderScoreSyncSummary> {
    const { InspectionService } = await import('~/modules/inspection');
    const [welders, stats] = await Promise.all([
      prisma.welders.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true, score: true, welderCode: true },
      }),
      InspectionService.getWelderScoreStats(),
    ]);

    if (welders.length === 0) {
      return {
        deductionIssueCount: issueCount(stats),
        matchedIssueCount: 0,
        updatedCount: 0,
      };
    }
    return applyDeductions(welders, stats);
  },
};
