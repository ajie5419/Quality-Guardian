import { DeptService } from '~/modules/dept';
import prisma from '~/utils/prisma';

import { requiresLinkedInternalResponsibility } from './inspection-record-display';

type InspectionResponsibilityCandidate = {
  category?: null | string;
  id: string;
  responsibilityType?: null | string;
  responsibleDepartment?: null | string;
};

export type LinkedInternalResponsibility = {
  linkedInternalResponsibilityUnresolved?: boolean;
  linkedInternalResponsibleDepartment?: null | string;
};

/**
 * Legacy close records may predate responsibility fields on `inspections`.
 * Resolve all candidate request links in one query; competing departments are
 * deliberately surfaced as unresolved instead of selecting an arbitrary row.
 */
export async function resolveLinkedInternalResponsibilities(
  inspections: InspectionResponsibilityCandidate[],
): Promise<Map<string, LinkedInternalResponsibility>> {
  const inspectionIds = inspections
    .filter((inspection) => requiresLinkedInternalResponsibility(inspection))
    .map((inspection) => inspection.id);
  if (inspectionIds.length === 0) return new Map();

  const inspectionIdSet = new Set(inspectionIds);
  const linkedRequests = await prisma.qms_inspection_requests.findMany({
    select: {
      inspectionId: true,
      inspectionLinks: {
        select: { inspectionId: true },
        where: { inspectionId: { in: inspectionIds } },
      },
      responsibleDepartment: true,
      responsibleDepartmentId: true,
    },
    where: {
      isDeleted: false,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      responsibleDepartment: { not: null },
      OR: [
        { inspectionId: { in: inspectionIds } },
        { inspectionLinks: { some: { inspectionId: { in: inspectionIds } } } },
      ],
    },
  });
  const departmentNames = await DeptService.resolveActiveNamesByIds(
    linkedRequests.map((request) => request.responsibleDepartmentId),
  );
  const departmentsByInspectionId = new Map<string, Map<string, string>>();
  for (const request of linkedRequests) {
    const departmentId = String(request.responsibleDepartmentId || '').trim();
    const department =
      departmentNames.get(departmentId) ||
      String(request.responsibleDepartment || '').trim();
    if (!department) continue;
    const linkedInspectionIds = new Set(
      [
        request.inspectionId,
        ...request.inspectionLinks.map((link) => link.inspectionId),
      ].filter(
        (inspectionId): inspectionId is string =>
          Boolean(inspectionId) && inspectionIdSet.has(inspectionId),
      ),
    );
    for (const inspectionId of linkedInspectionIds) {
      const departments =
        departmentsByInspectionId.get(inspectionId) ??
        new Map<string, string>();
      departments.set(
        departmentId ? `id:${departmentId}` : `name:${department}`,
        department,
      );
      departmentsByInspectionId.set(inspectionId, departments);
    }
  }

  return new Map<string, LinkedInternalResponsibility>(
    [...departmentsByInspectionId].map(
      ([inspectionId, departments]): [string, LinkedInternalResponsibility] => {
        if (departments.size === 1) {
          return [
            inspectionId,
            {
              linkedInternalResponsibleDepartment:
                [...departments.values()][0] || null,
            },
          ];
        }
        return [inspectionId, { linkedInternalResponsibilityUnresolved: true }];
      },
    ),
  );
}

/**
 * The historical fallback must also be filterable. Resolve a unique ID set
 * before the record query so Prisma applies pagination/count to the final
 * database predicate; a relation OR alone would include conflicted links.
 */
export async function resolveUniqueLinkedInternalInspectionIdsForTeam(
  team: string,
): Promise<string[]> {
  const currentDepartments = await DeptService.findActiveByNameContains(team);
  const matchingRequests = await prisma.qms_inspection_requests.findMany({
    select: {
      inspectionId: true,
      inspectionLinks: { select: { inspectionId: true } },
    },
    where: {
      isDeleted: false,
      responsibilityType: 'INTERNAL_DEPARTMENT',
      OR: [
        { responsibleDepartment: { contains: team } },
        ...(currentDepartments.length > 0
          ? [
              {
                responsibleDepartmentId: {
                  in: currentDepartments.map((department) => department.id),
                },
              },
            ]
          : []),
      ],
    },
  });
  const candidateIds = [
    ...new Set(
      matchingRequests.flatMap((request) => [
        request.inspectionId,
        ...request.inspectionLinks.map((link) => link.inspectionId),
      ]),
    ),
  ].filter(Boolean) as string[];
  if (candidateIds.length === 0) return [];

  const candidateInspections = candidateIds.map((id) => ({
    category: 'PROCESS',
    id,
    responsibilityType: null,
    responsibleDepartment: null,
  }));
  const resolved =
    await resolveLinkedInternalResponsibilities(candidateInspections);
  const normalizedTeam = team.trim().toLocaleLowerCase();
  return candidateIds.filter((inspectionId) => {
    const department =
      resolved.get(inspectionId)?.linkedInternalResponsibleDepartment || '';
    return department.toLocaleLowerCase().includes(normalizedTeam);
  });
}
