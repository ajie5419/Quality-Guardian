import type { InspectionIssueRecord } from '@/api/issues';

export function mergeAssignedNcNumber(
  issue: InspectionIssueRecord,
  response: Pick<InspectionIssueRecord, 'ncNumber'>,
): InspectionIssueRecord {
  return {
    ...issue,
    ncNumber: response.ncNumber,
  };
}
