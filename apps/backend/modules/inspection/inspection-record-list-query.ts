import type { AccessScope } from '~/modules/data-scope';

import { Prisma } from '@prisma/client';
import {
  buildInspectionRecordDateRange,
  normalizeInspectionStationSelection,
} from '@qgs/shared';
import { DataScopeService } from '~/modules/data-scope';
import { DeptService } from '~/modules/dept';
import {
  resolveCanonicalProcessName as resolveCanonicalProcessNameByRelation,
  resolveIncomingTypeNamesByIds,
} from '~/utils/process-resolver';
import { buildKeywordOr, buildYearFilter } from '~/utils/query-helpers';

import { resolveInspectionRecordTeamDisplay } from './inspection-record-display';
import {
  resolveLinkedInternalResponsibilities,
  resolveUniqueLinkedInternalInspectionIdsForTeam,
} from './inspection-record-linked-responsibility.service';
import {
  deriveInspectionIssueStatus,
  normalizeInspectionCategory,
} from './inspection-record-types';

export type ScopedInspectionAccess = {
  scope?: AccessScope;
  user?: { id?: number | string; username?: string };
  userContext?: { userId: string; username?: string };
};

export type InspectionRecordListParams = {
  componentName?: string;
  endDate?: string;
  hasDocuments?: boolean;
  inspector?: string;
  keyword?: string;
  level1Component?: string;
  materialName?: string;
  page?: number;
  pageSize?: number;
  processName?: string;
  projectName?: string;
  sourceInspectionId?: string;
  startDate?: string;
  supplierName?: string;
  team?: string;
  type?: string;
  workOrderNumber?: string;
  year?: number;
};

export type InspectionRecordExportParams = Omit<
  InspectionRecordListParams,
  'page' | 'pageSize'
>;

export type InspectionListRow = Prisma.inspectionsGetPayload<{
  include: {
    archiveTask?: {
      select: { dueAt: true; id: true; isOverdue: true; status: true };
    };
    process: { select: { name: true } };
    qualityRecords: {
      select: { quantity: true; status: true };
      where: { isDeleted: false };
    };
  };
}>;

export async function applyInspectionScope(
  baseWhere: Prisma.inspectionsWhereInput,
  access: ScopedInspectionAccess,
): Promise<Prisma.inspectionsWhereInput> {
  const user =
    access.userContext ??
    (access.user?.id
      ? { userId: String(access.user.id), username: access.user.username }
      : undefined);
  if (!user) {
    return baseWhere;
  }
  return DataScopeService.buildScopedWhere(
    'inspection',
    baseWhere,
    user,
    access.scope,
  );
}

export async function buildInspectionRecordScopedWhere(
  params: InspectionRecordExportParams,
  scopeContext: ScopedInspectionAccess,
): Promise<Prisma.inspectionsWhereInput> {
  const {
    type = 'INCOMING',
    year,
    hasDocuments,
    componentName,
    endDate,
    inspector,
    keyword,
    level1Component,
    materialName,
    processName,
    projectName,
    sourceInspectionId,
    startDate,
    supplierName,
    team,
    workOrderNumber,
  } = params;

  const where: Prisma.inspectionsWhereInput = {
    isDeleted: false,
  };
  const [linkedInternalInspectionIds, currentTeamDepartments] = team
    ? await Promise.all([
        resolveUniqueLinkedInternalInspectionIdsForTeam(team),
        DeptService.findActiveByNameContains(team),
      ])
    : [[], []];

  if (sourceInspectionId) {
    where.id = sourceInspectionId;
  } else if (type !== 'ALL') {
    const category = normalizeInspectionCategory(type);
    if (category) {
      where.category = category;
    }

    if (workOrderNumber) where.workOrderNumber = workOrderNumber;
    if (supplierName) where.supplierName = { contains: supplierName };
    if (typeof hasDocuments === 'boolean') where.hasDocuments = hasDocuments;
    if (processName) where.processName = { contains: processName };
    if (level1Component) where.level1Component = { contains: level1Component };
    if (componentName) where.level2Component = { contains: componentName };
    if (materialName) where.materialName = { contains: materialName };
    const additionalFilters: Prisma.inspectionsWhereInput[] = [];
    if (team) {
      const currentTeamDepartmentFilters: Prisma.inspectionsWhereInput[] =
        currentTeamDepartments.length > 0
          ? [
              {
                category: 'PROCESS',
                responsibilityType: 'INTERNAL_DEPARTMENT',
                responsibleDepartmentId: {
                  in: currentTeamDepartments.map((department) => department.id),
                },
              },
            ]
          : [];
      additionalFilters.push({
        OR: [
          { team: { contains: team } },
          {
            category: 'PROCESS',
            responsibilityType: 'INTERNAL_DEPARTMENT',
            responsibleDepartment: { contains: team },
          },
          ...currentTeamDepartmentFilters,
          {
            category: 'PROCESS',
            responsibilityType: 'OUTSOURCING_UNIT',
            supplierName: { contains: team },
          },
          {
            AND: [
              { category: 'PROCESS' },
              {
                OR: [
                  { responsibilityType: null },
                  { responsibilityType: 'INTERNAL_DEPARTMENT' },
                ],
              },
              {
                OR: [
                  { responsibleDepartment: null },
                  { responsibleDepartment: '' },
                ],
              },
              { id: { in: linkedInternalInspectionIds } },
            ],
          },
        ],
      });
    }
    if (inspector) where.inspector = { contains: inspector };
    if (projectName) where.projectName = { contains: projectName };

    const keywordOr = buildKeywordOr(keyword, [
      'workOrderNumber',
      'projectName',
      'supplierName',
      'inspector',
    ] as const);
    if (keywordOr) additionalFilters.push(keywordOr);
    if (additionalFilters.length > 0) where.AND = additionalFilters;

    const explicitDateRange = buildInspectionRecordDateRange({
      endDate,
      startDate,
    });
    if (explicitDateRange) {
      where.inspectionDate = {
        gte: explicitDateRange.start,
        lt: explicitDateRange.end,
      };
    } else if (year) {
      where.inspectionDate = buildYearFilter(year);
    }
  }

  return applyInspectionScope(where, scopeContext);
}

export async function mapInspectionListRows(rawItems: InspectionListRow[]) {
  const incomingTypeNameById = await resolveIncomingTypeNamesByIds(
    rawItems.map((item) =>
      item.category === 'INCOMING' ? item.incomingTypeId : null,
    ),
  );
  const [linkedResponsibilityByInspectionId, departmentNames] =
    await Promise.all([
      resolveLinkedInternalResponsibilities(rawItems),
      DeptService.resolveActiveNamesByIds(
        rawItems.map((item) => item.responsibleDepartmentId),
      ),
    ]);
  return rawItems.map((item) => {
    const linkedIssues = item.qualityRecords || [];
    const fallbackUnqualifiedQuantity = linkedIssues.reduce(
      (sum, issue) => sum + Number(issue.quantity || 0),
      0,
    );
    const unqualifiedQuantity =
      item.unqualifiedQuantity === null ||
      item.unqualifiedQuantity === undefined
        ? fallbackUnqualifiedQuantity
        : Number(item.unqualifiedQuantity || 0);

    return {
      ...item,
      incomingType:
        item.category === 'INCOMING'
          ? incomingTypeNameById.get(item.incomingTypeId || '') ||
            item.incomingType ||
            null
          : item.incomingType,
      archiveDueAt: item.archiveTask?.dueAt || null,
      archiveTaskId: item.archiveTask?.id || null,
      archiveIsOverdue: Boolean(item.archiveTask?.isOverdue),
      archiveTaskStatus: item.archiveTask?.status || null,
      issueStatus: deriveInspectionIssueStatus(linkedIssues),
      processName: resolveCanonicalProcessNameByRelation(item),
      qualifiedQuantity:
        item.qualifiedQuantity === null || item.qualifiedQuantity === undefined
          ? Math.max(0, Number(item.quantity || 1) - unqualifiedQuantity)
          : Number(item.qualifiedQuantity || 0),
      unqualifiedQuantity,
      stationSelection: normalizeInspectionStationSelection(
        item.stationSelection,
      ),
      team: resolveInspectionRecordTeamDisplay({
        ...item,
        responsibleDepartment:
          departmentNames.get(item.responsibleDepartmentId || '') ||
          item.responsibleDepartment,
        ...linkedResponsibilityByInspectionId.get(item.id),
      }),
    };
  });
}
