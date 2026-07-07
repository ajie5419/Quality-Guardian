import {
  clampWelderScore,
  resolveWelderIdByResponsibleText,
  resolveWelderSeverityDeduction,
} from '@qgs/shared';
import prisma from '~/utils/prisma';

const WELDER_SCORE_MAX = 12;

export const WelderScoreService = {
  async syncFromInspectionIssues(): Promise<{
    deductionIssueCount: number;
    matchedIssueCount: number;
    updatedCount: number;
  }> {
    const { InspectionService } = await import('~/modules/inspection');
    const [welders, stats] = await Promise.all([
      prisma.welders.findMany({
        where: { isDeleted: false },
        select: { id: true, name: true, score: true, welderCode: true },
      }),
      InspectionService.getWelderScoreStats(),
    ]);

    if (welders.length === 0) {
      const totalIssueCount = stats.reduce((sum, s) => sum + s._count.id, 0);
      return {
        deductionIssueCount: totalIssueCount,
        matchedIssueCount: 0,
        updatedCount: 0,
      };
    }

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
    const totalIssueCount = stats.reduce((sum, s) => sum + s._count.id, 0);
    return {
      deductionIssueCount: totalIssueCount,
      matchedIssueCount,
      updatedCount: updateOps.length,
    };
  },
};
