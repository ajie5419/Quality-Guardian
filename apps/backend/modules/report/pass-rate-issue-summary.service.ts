import { roundPercent } from '~/modules/report/pass-rate-process';
import prisma from '~/utils/prisma';

export async function getIssuePassRateSummaryByRange(start: Date, end: Date) {
  const [inspectionSummary, issueSummary] = await Promise.all([
    prisma.inspections.aggregate({
      where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
      _sum: { quantity: true },
    }),
    prisma.quality_records.aggregate({
      where: { isDeleted: false, date: { gte: start, lte: end } },
      _sum: { quantity: true },
    }),
  ]);
  const totalCount = Number(inspectionSummary._sum.quantity || 0);
  const unqualifiedCount = Math.max(
    0,
    Math.min(totalCount, Number(issueSummary._sum.quantity || 0)),
  );
  const passCount = Math.max(0, totalCount - unqualifiedCount);
  return {
    totalCount,
    passCount,
    passRate: totalCount > 0 ? roundPercent((passCount / totalCount) * 100) : 0,
  };
}
