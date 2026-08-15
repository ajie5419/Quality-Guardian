import type {
  InspectorHistoryCounts,
  ReinspectionCounts,
} from './inspection-request-stats-identity';

import {
  addInspectionRequestStatsDays as addDays,
  formatInspectionRequestStatsDate as formatShanghaiDate,
} from './inspection-request-stats-date';

const INSPECTION_EXECUTION_CODES = new Set(['QMS:Inspection:Requests:Close']);

function hasInspectionExecutionCode(codes: string[]) {
  return codes.some((code) => INSPECTION_EXECUTION_CODES.has(code));
}

function collectRolePermissionCodes(role?: {
  rbac_role_permissions?: Array<{
    permission?: null | { code?: null | string };
  }>;
}) {
  return role
    ? (role.rbac_role_permissions || [])
        .map((item) => item.permission?.code || '')
        .filter(Boolean)
    : [];
}

export interface InspectorStatsUser {
  roles: {
    rbac_role_permissions?: Array<{
      permission?: null | { code?: null | string };
    }>;
  };
  rbac_user_roles: Array<{
    role: null | {
      rbac_role_permissions?: Array<{
        permission?: null | { code?: null | string };
      }>;
    };
  }>;
}

export function isInspectorUser(user: InspectorStatsUser) {
  return [
    user.roles,
    ...user.rbac_user_roles.map((link) => link.role).filter(Boolean),
  ].some((role) =>
    hasInspectionExecutionCode(collectRolePermissionCodes(role)),
  );
}

export function createInspectionRequestStatsAccumulator(
  start: Date,
  end: Date,
) {
  const teamMap = new Map<string, number>();
  const departmentMap = new Map<string, number>();
  const supplierMap = new Map<string, number>();
  const inspectorMap = new Map<string, number>();
  const historyTeamMap = new Map<string, number>();
  const historyDepartmentMap = new Map<string, number>();
  const teamReinspectionMap = new Map<string, ReinspectionCounts>();
  const departmentReinspectionMap = new Map<string, ReinspectionCounts>();
  const supplierReinspectionMap = new Map<string, ReinspectionCounts>();
  const historyInspectorMap = new Map<string, InspectorHistoryCounts>();
  const dailyTrendMap = new Map<
    string,
    { closedCount: number; date: string; submittedCount: number }
  >();
  const counters = {
    todayClosedCount: 0,
    todaySubmittedCount: 0,
    todaySubmittedIncomingCount: 0,
    todaySubmittedProcessCount: 0,
    todayClosedIncomingCount: 0,
    todayClosedProcessCount: 0,
  };
  for (
    let cursor = new Date(start);
    cursor < end;
    cursor = addDays(cursor, 1)
  ) {
    const date = formatShanghaiDate(cursor);
    dailyTrendMap.set(date, { closedCount: 0, date, submittedCount: 0 });
  }
  return {
    counters,
    dailyTrendMap,
    departmentMap,
    departmentReinspectionMap,
    historyDepartmentMap,
    historyInspectorMap,
    historyTeamMap,
    inspectorMap,
    supplierMap,
    supplierReinspectionMap,
    teamMap,
    teamReinspectionMap,
  };
}
