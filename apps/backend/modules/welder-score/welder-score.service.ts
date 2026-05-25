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
    const [welders, issues] = await Promise.all([
      prisma.welders.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          name: true,
          score: true,
          welderCode: true,
        },
      }),
      prisma.quality_records.findMany({
        where: {
          isDeleted: false,
          responsibleWelder: {
            not: null,
          },
        },
        select: {
          id: true,
          responsibleWelder: true,
          severity: true,
        },
      }),
    ]);

    if (welders.length === 0) {
      return {
        deductionIssueCount: issues.length,
        matchedIssueCount: 0,
        updatedCount: 0,
      };
    }

    const deductionByWelder = new Map<string, number>();
    let matchedIssueCount = 0;
    for (const issue of issues) {
      const welderId = resolveWelderIdByResponsibleText({
        responsibleWelder: issue.responsibleWelder,
        welderCandidates: welders,
      });
      if (!welderId) continue;
      matchedIssueCount++;
      const current = deductionByWelder.get(welderId) || 0;
      deductionByWelder.set(
        welderId,
        current + resolveWelderSeverityDeduction(issue.severity),
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
          data: {
            score: nextScore,
            updatedAt: new Date(),
          },
        }),
      );
    }

    if (updateOps.length > 0) {
      await prisma.$transaction(updateOps);
    }

    return {
      deductionIssueCount: issues.length,
      matchedIssueCount,
      updatedCount: updateOps.length,
    };
  },
};
