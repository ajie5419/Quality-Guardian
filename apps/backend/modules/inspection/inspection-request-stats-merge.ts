import prisma from '~/utils/prisma';

/**
 * Resolve the configured responsibility department for a set of processes.
 * Used as a fallback for requests whose snapshot has no
 * responsibleDepartmentId (e.g. created before process responsibility
 * backfill), so department stats stay aligned with the process master data.
 */
export async function resolveProcessDepartmentsById(
  processIds: string[],
): Promise<Map<string, string>> {
  if (processIds.length === 0) return new Map();
  const processes = await prisma.processes.findMany({
    select: { id: true, responsibleDepartmentId: true },
    where: { id: { in: processIds }, isDeleted: false },
  });
  return new Map(
    processes
      .map((process) => [process.id, process.responsibleDepartmentId] as const)
      .filter((entry): entry is [string, string] =>
        Boolean(entry[1] && entry[1].trim()),
      ),
  );
}

/**
 * Merge helpers for inspection request statistics rows that resolve to the
 * same display name (e.g. a real TEAM row and a department-fallback row for
 * the same BU), so the dashboard shows one entry per BU.
 */

/**
 * Merge department-fallback rows (synthetic `dept:` ids) into the real TEAM
 * row with the same display name so the dashboard shows one entry per BU.
 * Two different real TEAM rows that happen to share a name stay separate.
 */
export function mergeSameNameCountRows(
  rows: Array<{ count: number; id: null | string; name: string }>,
) {
  const realRows = rows.filter((row) => row.id && !row.id.startsWith('dept:'));
  const fallbackRows = rows.filter(
    (row) => row.id && row.id.startsWith('dept:'),
  );
  const realNameCounts = new Map<string, number>();
  for (const row of realRows) {
    realNameCounts.set(row.name, (realNameCounts.get(row.name) || 0) + 1);
  }
  const merged = new Map<
    string,
    { count: number; id: null | string; name: string }
  >();
  for (const row of realRows) {
    merged.set(`${row.name}|${row.id}`, { ...row });
  }
  for (const row of fallbackRows) {
    if (realNameCounts.get(row.name) === 1) {
      const target = [...merged.values()].find((r) => r.name === row.name);
      if (target) {
        target.count += row.count;
        continue;
      }
    }
    merged.set(`${row.name}|${row.id}`, { ...row });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}

/**
 * Merge reinspection rows that resolve to the same display name, summing
 * inspected/reinspected/submitted counts and recomputing the rate. A
 * department-fallback row merges into the unique real row with the same
 * display name; ambiguous names stay separate rows.
 */
export function mergeSameNameReinspectionRows(
  rows: Array<{
    id: null | string;
    inspectedCount: number;
    name: string;
    reinspectionCount: number;
    reinspectionRate: number;
    submittedCount: number;
  }>,
) {
  const realRows = rows.filter((row) => row.id && !row.id.startsWith('dept:'));
  const fallbackRows = rows.filter(
    (row) => row.id && row.id.startsWith('dept:'),
  );
  const realNameCounts = new Map<string, number>();
  for (const row of realRows) {
    realNameCounts.set(row.name, (realNameCounts.get(row.name) || 0) + 1);
  }
  const byName = new Map<
    string,
    {
      id: null | string;
      inspectedCount: number;
      name: string;
      reinspectionCount: number;
      submittedCount: number;
    }
  >();
  for (const row of realRows) {
    byName.set(`${row.name}|${row.id}`, {
      id: row.id,
      inspectedCount: row.inspectedCount,
      name: row.name,
      reinspectionCount: row.reinspectionCount,
      submittedCount: row.submittedCount,
    });
  }
  for (const row of fallbackRows) {
    if (realNameCounts.get(row.name) === 1) {
      const target = [...byName.values()].find((r) => r.name === row.name);
      if (target) {
        target.inspectedCount += row.inspectedCount;
        target.reinspectionCount += row.reinspectionCount;
        target.submittedCount += row.submittedCount;
        continue;
      }
    }
    byName.set(`${row.name}|${row.id}`, {
      id: row.id,
      inspectedCount: row.inspectedCount,
      name: row.name,
      reinspectionCount: row.reinspectionCount,
      submittedCount: row.submittedCount,
    });
  }
  return [...byName.values()]
    .map((stat) => ({
      ...stat,
      reinspectionRate:
        stat.inspectedCount > 0
          ? Math.round((stat.reinspectionCount / stat.inspectedCount) * 1000) /
            10
          : 0,
    }))
    .sort((a, b) => b.submittedCount - a.submittedCount);
}
