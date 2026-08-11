import type { Prisma } from '@prisma/client';

import { resolveInspectionRequestIssueResponsibility } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { SupplierIdentityService } from '~/modules/supplier-identity';
import { TeamIdentityService } from '~/modules/team';

type RequestSource = {
  category?: null | string;
  processName?: null | string;
  supplierId?: null | string;
  team?: null | string;
  teamId?: null | string;
};

type Responsibility = ReturnType<
  typeof resolveInspectionRequestIssueResponsibility
> & {
  responsibleDepartmentId: null | string;
};

function singleId(rows: ReadonlyArray<{ id: string }>) {
  const [row] = rows;
  return rows.length === 1 && row ? row.id : null;
}

export async function resolveInspectionRequestIssueResponsibilities(
  requests: ReadonlyArray<RequestSource>,
  options: {
    client?: Prisma.TransactionClient;
    teamSupplierByTeamId?: ReadonlyMap<string, { id: string; name: string }>;
  } = {},
): Promise<Responsibility[]> {
  const teamIds = requests.map((request) => request.teamId);
  const teamSupplierByTeamId =
    options.teamSupplierByTeamId ??
    (options.client
      ? new Map(
          await Promise.all(
            [...new Set(teamIds.filter(Boolean))].map(
              async (teamId) =>
                [
                  teamId,
                  await SupplierIdentityService.resolveSupplierByTeamId(
                    teamId,
                    options.client,
                  ),
                ] as const,
            ),
          ).then((entries) =>
            entries.filter(
              (entry): entry is [string, { id: string; name: string }] =>
                Boolean(entry[1]),
            ),
          ),
        )
      : await SupplierIdentityService.resolveSuppliersByTeamIds(teamIds));
  const departmentSourceIds =
    await TeamIdentityService.resolveActiveDepartmentSourceIdsByTeamIds(
      teamIds,
      options.client,
    );
  const base = requests.map((request) =>
    resolveInspectionRequestIssueResponsibility({
      category: request.category,
      processName: request.processName,
      supplierId: request.supplierId,
      team: request.team,
      teamSupplier: request.teamId
        ? teamSupplierByTeamId.get(request.teamId)
        : null,
    }),
  );
  const departmentIds = base.flatMap((item, index) =>
    item.responsibilityType === 'INTERNAL_DEPARTMENT'
      ? (departmentSourceIds.get(requests[index]?.teamId || '') ?? [])
      : [],
  );
  const fixedNames = base
    .filter((item) => item.responsibilityType !== 'INTERNAL_DEPARTMENT')
    .map((item) => item.responsibleDepartment);
  const departments = await DeptService.findActiveByIdsOrNames(
    { ids: departmentIds, names: fixedNames },
    options.client,
  );
  return base.map((item, index) => {
    const candidates =
      item.responsibilityType === 'INTERNAL_DEPARTMENT'
        ? departments.filter((department) =>
            (
              departmentSourceIds.get(requests[index]?.teamId || '') ?? []
            ).includes(department.id),
          )
        : departments.filter(
            (department) => department.name === item.responsibleDepartment,
          );
    const responsibleDepartmentId = singleId(candidates);
    const [department] = candidates;
    return {
      ...item,
      responsibleDepartment:
        responsibleDepartmentId && department
          ? department.name
          : item.responsibleDepartment,
      responsibleDepartmentId,
    };
  });
}

export async function resolveInspectionRequestIssueResponsibilityInTransaction(
  request: RequestSource,
  tx: Prisma.TransactionClient,
) {
  const [responsibility] = await resolveInspectionRequestIssueResponsibilities(
    [request],
    { client: tx },
  );
  if (!responsibility) {
    throw new Error(
      'Inspection request responsibility resolution returned no result',
    );
  }
  return responsibility;
}
