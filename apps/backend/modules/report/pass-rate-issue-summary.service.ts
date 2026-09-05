import type { AnalyticsAccessContext } from '~/modules/data-scope';

import { roundPercent } from '~/modules/report/pass-rate-process';
import {
  buildScopedInspectionWhere,
  buildScopedIssueWhere,
} from '~/modules/report/pass-rate-scope';
import prisma from '~/utils/prisma';

export async function getIssuePassRateSummaryByRange(
  start: Date,
  end: Date,
  access?: AnalyticsAccessContext,
) {
  const inspectionWhere = await buildScopedInspectionWhere(
    { isDeleted: false, inspectionDate: { gte: start, lte: end } },
    access,
  );
  const issueWhere = await buildScopedIssueWhere(
    { isDeleted: false, date: { gte: start, lte: end } },
    access,
  );
  const [inspectionSummary, issueSummary] = await Promise.all([
    prisma.inspections.aggregate({
      where: inspectionWhere,
      _sum: { quantity: true },
    }),
    prisma.quality_records.aggregate({
      where: issueWhere,
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
