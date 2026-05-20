export function buildRequirementSummaryMap(
  rows: Array<{
    confirmStatus: string;
    createdAt: Date;
    workOrderNumber: string;
  }>,
) {
  const result = new Map<
    string,
    {
      confirmedRequirements: number;
      overdueUnconfirmedRequirements: number;
      plannedRequirements: number;
    }
  >();
  const now = Date.now();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const workOrderNumber = String(row.workOrderNumber || '').trim();
    if (!workOrderNumber) continue;

    const current = result.get(workOrderNumber) || {
      confirmedRequirements: 0,
      overdueUnconfirmedRequirements: 0,
      plannedRequirements: 0,
    };
    current.plannedRequirements += 1;

    const confirmStatus = String(row.confirmStatus || '')
      .trim()
      .toUpperCase();
    if (confirmStatus === 'CONFIRMED') {
      current.confirmedRequirements += 1;
    } else if (now - new Date(row.createdAt).getTime() > tenDaysMs) {
      current.overdueUnconfirmedRequirements += 1;
    }
    result.set(workOrderNumber, current);
  }

  return result;
}
