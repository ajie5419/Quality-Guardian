import type { Prisma } from '@prisma/client';

import { normalizeInspectionRequestText } from './inspection-request';

export function buildCloseLinkedIssueWhere(
  request: { linkedIssueId?: null | string; linkedIssueNo?: null | string },
  issueId?: null | string,
): null | Prisma.quality_recordsWhereInput {
  const ids = [
    normalizeInspectionRequestText(issueId),
    normalizeInspectionRequestText(request.linkedIssueId),
  ].filter(Boolean);
  const issueNo = normalizeInspectionRequestText(request.linkedIssueNo);
  const OR: Prisma.quality_recordsWhereInput[] = [];
  if (ids.length > 0) OR.push({ id: { in: [...new Set(ids)] } });
  if (issueNo) OR.push({ nonConformanceNumber: issueNo });
  return OR.length > 0 ? { isDeleted: false, OR } : null;
}
