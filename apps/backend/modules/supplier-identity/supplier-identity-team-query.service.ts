import type {
  InspectionRequestTeamOption,
  InspectionRequestTeamResolution,
  InspectionRequestTeamResolutionReason,
} from '@qgs/shared';

import {
  EXTERNAL_SERVICE_OUTSOURCING_MODE,
  IN_HOUSE_OUTSOURCING_MODE,
  OUTSOURCING_CATEGORY,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import prisma from '~/utils/prisma';

import { resolveSuppliersByTeamIds } from './supplier-identity-name-resolver';

export type SupplierIdentityTeamResolution = InspectionRequestTeamResolution;
export type SupplierIdentityTeamResolutionReason =
  InspectionRequestTeamResolutionReason;
export type SupplierIdentityTeamOption = InspectionRequestTeamOption;

export async function listSupplierIdentityTeamOptions(
  keyword = '',
): Promise<SupplierIdentityTeamOption[]> {
  const normalizedKeyword = keyword.trim();
  const teams = await prisma.dictionaries.findMany({
    where: {
      dictType: 'team',
      isDeleted: false,
      status: 1,
      ...(normalizedKeyword
        ? { dictKey: { contains: normalizedKeyword } }
        : {}),
    },
    orderBy: [{ sort: 'asc' }, { dictKey: 'asc' }],
    take: 100,
    select: { dictKey: true, id: true },
  });
  const linkedSuppliers = await resolveSuppliersByTeamIds(
    teams.map((team) => team.id),
  );
  const teamIds = teams.map((team) => team.id);
  const sources = await prisma.team_identity_sources.findMany({
    select: { sourceId: true, sourceType: true, teamId: true },
    where: { isDeleted: false, teamId: { in: teamIds } },
  });
  const activeLinks = await prisma.supplier_identity_links.findMany({
    select: { identityId: true },
    where: {
      identityId: { in: teamIds },
      identityType: 'TEAM',
      isDeleted: false,
    },
  });
  const activeLinkTeamIds = new Set(activeLinks.map((link) => link.identityId));
  const departmentSourceIds = [
    ...new Set(
      sources
        .filter((source) => source.sourceType === 'DEPARTMENT')
        .map((source) => source.sourceId),
    ),
  ];
  const activeDepartments = await DeptService.findActiveByIdsOrNames({
    ids: departmentSourceIds,
  });
  const activeDepartmentIds = new Set(
    activeDepartments.map((department) => department.id),
  );

  return teams.map((team) => {
    const teamSources = sources.filter((source) => source.teamId === team.id);
    const departmentIds = [
      ...new Set(
        teamSources
          .filter((source) => source.sourceType === 'DEPARTMENT')
          .map((source) => source.sourceId),
      ),
    ];
    const hasSupplierSource = teamSources.some(
      (source) => source.sourceType === 'SUPPLIER',
    );
    const supplier = linkedSuppliers.get(team.id);
    if (supplier) {
      return {
        group: 'external' as const,
        label: team.dictKey,
        supplierId: supplier.id,
        value: team.id,
      };
    }
    if (hasSupplierSource && departmentIds.length > 0) {
      return {
        group: 'unresolved' as const,
        label: team.dictKey,
        reason: 'CONFLICTING_TEAM_SOURCES' as const,
        value: team.id,
      };
    }
    if (hasSupplierSource || activeLinkTeamIds.has(team.id)) {
      return {
        group: 'unresolved' as const,
        label: team.dictKey,
        reason: 'INVALID_EXTERNAL_SUPPLIER_MAPPING' as const,
        value: team.id,
      };
    }
    if (departmentIds.length === 0) {
      return {
        group: 'unresolved' as const,
        label: team.dictKey,
        reason: 'MISSING_RESPONSIBILITY_SOURCE' as const,
        value: team.id,
      };
    }
    const activeDepartmentCandidates = departmentIds.filter((departmentId) =>
      activeDepartmentIds.has(departmentId),
    );
    if (activeDepartmentCandidates.length === 0) {
      return {
        group: 'unresolved' as const,
        label: team.dictKey,
        reason: 'INACTIVE_DEPARTMENT_SOURCE' as const,
        value: team.id,
      };
    }
    if (activeDepartmentCandidates.length > 1) {
      return {
        group: 'unresolved' as const,
        label: team.dictKey,
        reason: 'AMBIGUOUS_DEPARTMENT_SOURCE' as const,
        value: team.id,
      };
    }
    const [departmentId] = activeDepartmentCandidates;
    return {
      group: 'internal' as const,
      label: team.dictKey,
      responsibleDepartmentId: departmentId,
      value: team.id,
    };
  });
}

export async function listTeamIdsForSupplier(supplierId: string) {
  const teamIds = await listTeamIdsBySupplierIds([supplierId]);
  return teamIds.get(supplierId.trim()) || [];
}

export async function listTeamIdsBySupplierIds(supplierIds: string[]) {
  const ids = [
    ...new Set(
      supplierIds.map((supplierId) => String(supplierId || '').trim()),
    ),
  ].filter(Boolean);
  if (ids.length === 0) return new Map<string, string[]>();
  const suppliers = await prisma.suppliers.findMany({
    select: { id: true },
    where: {
      category: OUTSOURCING_CATEGORY,
      id: { in: ids },
      isDeleted: false,
      outsourcingMode: {
        in: [IN_HOUSE_OUTSOURCING_MODE, EXTERNAL_SERVICE_OUTSOURCING_MODE],
      },
    },
  });
  const eligibleSupplierIds = suppliers.map((supplier) => supplier.id);
  if (eligibleSupplierIds.length === 0) return new Map<string, string[]>();
  const links = await prisma.supplier_identity_links.findMany({
    select: { identityId: true, supplierId: true },
    where: {
      identityType: 'TEAM',
      isDeleted: false,
      supplierId: { in: eligibleSupplierIds },
    },
  });
  if (links.length === 0) return new Map<string, string[]>();
  const linkedTeamIds = [...new Set(links.map((link) => link.identityId))];
  const sources = await prisma.team_identity_sources.findMany({
    select: { sourceId: true, teamId: true },
    where: {
      isDeleted: false,
      sourceId: { in: eligibleSupplierIds },
      sourceType: 'SUPPLIER',
      teamId: { in: linkedTeamIds },
      team: {
        is: {
          teamIdentitySources: {
            none: { isDeleted: false, sourceType: 'DEPARTMENT' },
          },
        },
      },
    },
  });
  const sourcePairs = new Set(
    sources.map((source) => `${source.sourceId}:${source.teamId}`),
  );
  const teams = await prisma.dictionaries.findMany({
    select: { id: true },
    where: {
      dictType: 'team',
      id: { in: linkedTeamIds },
      isDeleted: false,
      status: 1,
    },
  });
  const activeTeamIds = new Set(teams.map((team) => team.id));
  const result = new Map<string, string[]>();
  for (const link of links) {
    if (
      !activeTeamIds.has(link.identityId) ||
      !sourcePairs.has(`${link.supplierId}:${link.identityId}`)
    ) {
      continue;
    }
    const teamIds = result.get(link.supplierId) || [];
    teamIds.push(link.identityId);
    result.set(link.supplierId, teamIds);
  }
  return result;
}
