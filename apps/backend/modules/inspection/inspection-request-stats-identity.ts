export const UNRESOLVED_IDENTITY_KEY = '';
export const UNRESOLVED_INSPECTOR_NAME = 'Unresolved inspector';
export const UNRESOLVED_SUPPLIER_NAME = 'Unresolved supplier';
export const UNRESOLVED_TEAM_NAME = 'Unresolved team';

export interface ReinspectionCounts {
  inspectedCount: number;
  reinspectionCount: number;
  submittedCount: number;
}

export interface InspectorHistoryCounts {
  averageTaskMinutes: number;
  completedTaskCount: number;
  totalTaskMinutes: number;
}

export function normalizeIdentityId(value?: null | string) {
  const id = value?.trim();
  return id || null;
}

export function isIncomingInspectionRequest(input: {
  category: 'INCOMING' | 'PROCESS' | 'SHIPMENT' | null;
  supplierId: null | string;
  teamId: null | string;
}) {
  if (input.category) return input.category === 'INCOMING';

  // Legacy process requests may also carry a supplier linked to their TEAM.
  // TEAM identity therefore wins when the persisted category is not backfilled.
  if (normalizeIdentityId(input.teamId)) return false;
  return Boolean(normalizeIdentityId(input.supplierId));
}

export function collectIdentityIds(values: ReadonlyArray<null | string>) {
  return [
    ...new Set(
      values
        .map((value) => normalizeIdentityId(value))
        .filter((value): value is string => value !== null),
    ),
  ];
}

export function createIdentityCountRows(
  counts: ReadonlyMap<string, number>,
  namesById: ReadonlyMap<string, string>,
  unresolvedName: string,
) {
  return [...counts.entries()]
    .map(([key, count]) => {
      const id = key || null;
      return {
        count,
        id,
        name: id
          ? namesById.get(id) || `${unresolvedName} (${id})`
          : unresolvedName,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function createInspectorHistoryRows(
  counts: ReadonlyMap<string, InspectorHistoryCounts>,
  namesById: ReadonlyMap<string, string>,
) {
  return [...counts.entries()]
    .map(([key, stat]) => {
      const inspectorId = key || null;
      return {
        ...stat,
        inspector: inspectorId
          ? namesById.get(inspectorId) ||
            `${UNRESOLVED_INSPECTOR_NAME} (${inspectorId})`
          : UNRESOLVED_INSPECTOR_NAME,
        inspectorId,
      };
    })
    .sort((a, b) => b.completedTaskCount - a.completedTaskCount);
}

export function createReinspectionRows(
  counts: ReadonlyMap<string, ReinspectionCounts>,
  namesById: ReadonlyMap<string, string>,
  unresolvedName: string,
) {
  return [...counts.entries()]
    .map(([key, stat]) => {
      const id = key || null;
      return {
        ...stat,
        id,
        name: id
          ? namesById.get(id) || `${unresolvedName} (${id})`
          : unresolvedName,
        reinspectionRate:
          stat.inspectedCount > 0
            ? Math.round(
                (stat.reinspectionCount / stat.inspectedCount) * 1000,
              ) / 10
            : 0,
      };
    })
    .sort(
      (a, b) =>
        b.reinspectionRate - a.reinspectionRate ||
        b.reinspectionCount - a.reinspectionCount ||
        b.inspectedCount - a.inspectedCount ||
        b.submittedCount - a.submittedCount,
    );
}
