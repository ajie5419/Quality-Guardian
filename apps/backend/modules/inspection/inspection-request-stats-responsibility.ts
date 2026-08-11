import type { ReinspectionCounts } from './inspection-request-stats-identity';

import {
  createIdentityCountRows,
  createReinspectionRows,
  UNRESOLVED_DEPARTMENT_NAME,
} from './inspection-request-stats-identity';

/**
 * Responsibility is an independent aggregation domain. A PROCESS request can
 * carry an execution TEAM, but that optional context must not become the
 * department's durable statistics identity.
 */
export function buildInspectionRequestDepartmentStats(options: {
  departmentNamesById: ReadonlyMap<string, string>;
  departmentReinspectionMap: ReadonlyMap<string, ReinspectionCounts>;
  historyDepartmentMap: ReadonlyMap<string, number>;
  submittedDepartmentMap: ReadonlyMap<string, number>;
}) {
  const toDepartmentRows = (counts: ReadonlyMap<string, number>) =>
    createIdentityCountRows(
      counts,
      options.departmentNamesById,
      UNRESOLVED_DEPARTMENT_NAME,
    ).map(({ count, id, name }) => ({
      count,
      department: name,
      responsibleDepartmentId: id,
    }));
  return {
    byDepartment: toDepartmentRows(options.submittedDepartmentMap),
    historyByDepartment: toDepartmentRows(options.historyDepartmentMap),
    reinspectionRateByDepartment: createReinspectionRows(
      options.departmentReinspectionMap,
      options.departmentNamesById,
      UNRESOLVED_DEPARTMENT_NAME,
    ).map(({ id, name, ...stat }) => ({
      ...stat,
      department: name,
      responsibleDepartmentId: id,
    })),
  };
}
