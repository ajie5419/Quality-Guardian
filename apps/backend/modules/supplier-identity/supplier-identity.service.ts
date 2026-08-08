import type { inspection_category, Prisma } from '@prisma/client';

import type { SupplierIdentityOptionsQuery } from './supplier-identity.schema';

import { resolveSupplierInspectionPolicy } from '@qgs/shared';
import { MetricRefreshQueue } from '~/modules/metric-refresh';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

import { listSupplierIdentityManagementOptions } from './supplier-identity-management-options.service';
import {
  resolveSuppliersByTeamIds as resolveSuppliersByTeamIdsFromMaster,
  resolveTeamSupplierIdentity,
  teamLinkInclude,
} from './supplier-identity-name-resolver';

export interface SupplierIdentityInput {
  supplierId: string;
  teamId: string;
}

const logger = createModuleLogger('SupplierIdentityService');

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

async function lockTeamForMutation(
  teamId: string,
  client: Pick<
    Prisma.TransactionClient,
    '$queryRaw' | 'team_identity_merge_participants'
  >,
) {
  await client.$queryRaw`
    SELECT id
    FROM dictionaries
    WHERE id = ${teamId} AND dictType = 'team'
    FOR UPDATE
  `;
  const mergeLock = await client.team_identity_merge_participants.findUnique({
    where: { teamId },
    select: { mergeId: true },
  });
  if (mergeLock) {
    throw new BusinessError(
      'TEAM_MERGE_PARTICIPANT_LOCKED',
      'TEAM is locked by an identity merge',
      409,
    );
  }
}

async function lockTeamsForMutation(
  teamIds: string[],
  client: Prisma.TransactionClient,
) {
  for (const teamId of [...new Set(teamIds)].sort()) {
    await lockTeamForMutation(teamId, client);
  }
}

async function validateLinkInput(
  input: SupplierIdentityInput,
  client: Pick<
    Prisma.TransactionClient,
    'dictionaries' | 'suppliers' | 'team_identity_sources'
  >,
) {
  const supplierId = normalizeId(input.supplierId);
  const teamId = normalizeId(input.teamId);
  if (!supplierId || !teamId) {
    throw new BusinessError('VALIDATION', 'supplierId and teamId are required');
  }
  const [supplier, team] = await Promise.all([
    client.suppliers.findFirst({
      select: { category: true, id: true, name: true, outsourcingMode: true },
      where: { id: supplierId, isDeleted: false },
    }),
    client.dictionaries.findFirst({
      select: { dictKey: true, id: true },
      where: {
        dictType: 'team',
        id: teamId,
        isDeleted: false,
        status: 1,
      },
    }),
  ]);
  if (!supplier) {
    throw new BusinessError('INVALID_SUPPLIER_ID', 'Supplier does not exist');
  }
  if (!team) {
    throw new BusinessError('INVALID_TEAM_ID', 'Active TEAM does not exist');
  }
  if (resolveSupplierInspectionPolicy(supplier).identitySource !== 'team') {
    throw new BusinessError(
      'INVALID_PROCESS_SUPPLIER',
      'TEAM links require an active in-house team or external service supplier',
    );
  }
  const source = await client.team_identity_sources.findFirst({
    select: { id: true },
    where: {
      isDeleted: false,
      sourceId: supplier.id,
      sourceType: 'SUPPLIER',
      teamId: team.id,
    },
  });
  if (!source) {
    throw new BusinessError(
      'TEAM_NOT_EXTERNAL_SUPPLIER_SOURCE',
      'TEAM is not the canonical external team for this supplier',
    );
  }
  return { supplier, team };
}

async function assertNoProcessFactsForTeams(
  teamIds: ReadonlyArray<string>,
  client: Pick<
    Prisma.TransactionClient,
    'inspections' | 'qms_inspection_requests'
  >,
) {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (ids.length === 0) return;
  const [inspectionCount, requestCount] = await Promise.all([
    client.inspections.count({
      where: { category: 'PROCESS', isDeleted: false, teamId: { in: ids } },
    }),
    client.qms_inspection_requests.count({
      where: { category: 'PROCESS', isDeleted: false, teamId: { in: ids } },
    }),
  ]);
  if (inspectionCount + requestCount > 0) {
    throw new BusinessError(
      'TEAM_IDENTITY_FACTS_EXIST',
      'Historical process facts must be reconciled before changing this TEAM link',
      409,
    );
  }
}

function teamIdentityConflict() {
  return new BusinessError(
    'TEAM_IDENTITY_CONFLICT',
    'TEAM is already linked to another supplier',
    409,
  );
}

export const SupplierIdentityService = {
  async assertTeamCanBeRetired(
    teamId: string,
    client: Pick<Prisma.TransactionClient, 'supplier_identity_links'> = prisma,
  ) {
    const activeLink = await client.supplier_identity_links.findFirst({
      select: { id: true },
      where: {
        identityId: normalizeId(teamId),
        identityType: 'TEAM',
        isDeleted: false,
      },
    });
    if (activeLink) {
      throw new BusinessError(
        'TEAM_IDENTITY_LINK_ACTIVE',
        'TEAM must be unlinked from its supplier before it can be disabled or deleted',
        409,
      );
    }
  },

  async create(input: SupplierIdentityInput) {
    try {
      return await prisma.$transaction(async (tx) => {
        const teamId = normalizeId(input.teamId);
        await lockTeamForMutation(teamId, tx);
        const { supplier, team } = await validateLinkInput(input, tx);
        const existing = await tx.supplier_identity_links.findUnique({
          where: {
            identityType_identityId: {
              identityId: team.id,
              identityType: 'TEAM',
            },
          },
        });
        if (
          existing &&
          !existing.isDeleted &&
          existing.supplierId !== supplier.id
        ) {
          throw teamIdentityConflict();
        }
        const link = existing
          ? await tx.supplier_identity_links.update({
              where: { id: existing.id },
              data: {
                identityNameSnapshot: team.dictKey,
                isDeleted: false,
                supplierId: supplier.id,
              },
              include: teamLinkInclude,
            })
          : await tx.supplier_identity_links.create({
              data: {
                identityId: team.id,
                identityNameSnapshot: team.dictKey,
                identityType: 'TEAM',
                supplierId: supplier.id,
              },
              include: teamLinkInclude,
            });
        await MetricRefreshQueue.enqueueSupplierScores(
          tx,
          [existing?.supplierId, supplier.id],
          existing ? 'supplier-identity.restored' : 'supplier-identity.created',
        );
        return link;
      });
    } catch (error) {
      logger.error(
        { err: error, supplierId: input.supplierId, teamId: input.teamId },
        'failed to create supplier identity link',
      );
      if (isPrismaUniqueConstraintError(error)) {
        throw teamIdentityConflict();
      }
      throw error;
    }
  },

  lockTeamForMutation,

  async delete(id: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.supplier_identity_links.findFirst({
        select: { id: true, identityId: true, supplierId: true },
        where: { id, isDeleted: false },
      });
      if (!existing) {
        throw new BusinessError(
          'NOT_FOUND',
          'Supplier identity link not found',
          404,
        );
      }
      await lockTeamForMutation(existing.identityId, tx);
      await assertNoProcessFactsForTeams([existing.identityId], tx);
      const deleted = await tx.supplier_identity_links.updateMany({
        where: {
          id,
          identityId: existing.identityId,
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
      if (deleted.count !== 1) {
        throw new BusinessError(
          'TEAM_IDENTITY_CONCURRENT_UPDATE',
          'Supplier identity link changed concurrently',
          409,
        );
      }
      await MetricRefreshQueue.enqueueSupplierScores(
        tx,
        [existing.supplierId],
        'supplier-identity.deleted',
      );
      return tx.supplier_identity_links.findUnique({ where: { id } });
    });
  },

  async list(params: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where = { isDeleted: false } as const;
    const [items, total] = await Promise.all([
      prisma.supplier_identity_links.findMany({
        where,
        include: teamLinkInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplier_identity_links.count({ where }),
    ]);
    return { items, total };
  },

  async listManagementOptions(params?: SupplierIdentityOptionsQuery) {
    return listSupplierIdentityManagementOptions(params ?? { take: 100 });
  },

  async resolveSupplierById(
    supplierId: null | string | undefined,
    client: Pick<Prisma.TransactionClient, 'suppliers'> = prisma,
  ) {
    const id = normalizeId(supplierId);
    if (!id) return null;
    const supplier = await client.suppliers.findFirst({
      select: { id: true, name: true },
      where: { id, isDeleted: false },
    });
    if (!supplier) {
      throw new BusinessError('INVALID_SUPPLIER_ID', 'Supplier does not exist');
    }
    return supplier;
  },

  async resolveNamesByIds(
    supplierIds: ReadonlyArray<null | string | undefined>,
  ) {
    const ids = [
      ...new Set(
        supplierIds
          .map((supplierId) => normalizeId(supplierId))
          .filter(Boolean),
      ),
    ];
    if (ids.length === 0) return new Map<string, string>();
    const suppliers = await prisma.suppliers.findMany({
      select: { id: true, name: true },
      where: { id: { in: ids }, isDeleted: false },
    });
    return new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  },

  async resolveSupplierByTeamId(
    teamId: null | string | undefined,
    client?: Parameters<typeof resolveTeamSupplierIdentity>[1],
  ) {
    const id = normalizeId(teamId);
    if (!id) return null;
    return resolveTeamSupplierIdentity(id, client);
  },

  async resolveSuppliersByTeamIds(
    teamIds: ReadonlyArray<null | string | undefined>,
  ) {
    return resolveSuppliersByTeamIdsFromMaster(teamIds);
  },

  async resolveTeamById(
    teamId: null | string | undefined,
    client: Pick<Prisma.TransactionClient, 'dictionaries'> = prisma,
  ) {
    const id = normalizeId(teamId);
    if (!id) return null;
    const team = await client.dictionaries.findFirst({
      select: { dictKey: true, id: true },
      where: {
        dictType: 'team',
        id,
        isDeleted: false,
        status: 1,
      },
    });
    if (!team) {
      throw new BusinessError('INVALID_TEAM_ID', 'Active TEAM does not exist');
    }
    return { id: team.id, name: team.dictKey };
  },

  async listTeamOptions(keyword = '') {
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
    const links = await prisma.supplier_identity_links.findMany({
      where: {
        identityId: { in: teams.map((team) => team.id) },
        identityType: 'TEAM',
        isDeleted: false,
      },
      select: { identityId: true },
    });
    const linkedTeamIds = new Set(links.map((link) => link.identityId));
    return teams.map((team) => ({
      group: linkedTeamIds.has(team.id)
        ? ('external' as const)
        : ('internal' as const),
      label: team.dictKey,
      value: team.id,
    }));
  },

  async resolveSupplierForInspection(
    input: {
      category: inspection_category | string;
      supplierId?: null | string;
      teamId?: null | string;
    },
    client?: Prisma.TransactionClient,
  ) {
    if (input.category === 'PROCESS') {
      return this.resolveSupplierByTeamId(input.teamId, client);
    }
    return this.resolveSupplierById(input.supplierId, client);
  },

  async teamIdsForSupplier(supplierId: string) {
    const links = await prisma.supplier_identity_links.findMany({
      select: { identityId: true },
      where: {
        identityType: 'TEAM',
        isDeleted: false,
        supplierId,
      },
    });
    return links.map((link) => link.identityId);
  },

  async teamIdsBySupplierIds(supplierIds: string[]) {
    const ids = [
      ...new Set(supplierIds.map((supplierId) => normalizeId(supplierId))),
    ].filter(Boolean);
    if (ids.length === 0) return new Map<string, string[]>();
    const links = await prisma.supplier_identity_links.findMany({
      select: { identityId: true, supplierId: true },
      where: {
        identityType: 'TEAM',
        isDeleted: false,
        supplierId: { in: ids },
      },
    });
    const result = new Map<string, string[]>();
    for (const link of links) {
      const teamIds = result.get(link.supplierId) || [];
      teamIds.push(link.identityId);
      result.set(link.supplierId, teamIds);
    }
    return result;
  },

  async update(id: string, input: SupplierIdentityInput) {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.supplier_identity_links.findFirst({
          select: { id: true, identityId: true, supplierId: true },
          where: { id, isDeleted: false },
        });
        if (!current) {
          throw new BusinessError(
            'NOT_FOUND',
            'Supplier identity link not found',
            404,
          );
        }
        const requestedTeamId = normalizeId(input.teamId);
        await lockTeamsForMutation([current.identityId, requestedTeamId], tx);
        const lockedCurrent = await tx.supplier_identity_links.findFirst({
          select: { id: true },
          where: {
            id,
            identityId: current.identityId,
            isDeleted: false,
          },
        });
        if (!lockedCurrent) {
          throw new BusinessError(
            'TEAM_IDENTITY_CONCURRENT_UPDATE',
            'Supplier identity link changed concurrently',
            409,
          );
        }
        const { supplier, team } = await validateLinkInput(input, tx);
        const conflict = await tx.supplier_identity_links.findFirst({
          select: { id: true },
          where: {
            id: { not: id },
            identityId: team.id,
            identityType: 'TEAM',
            isDeleted: false,
          },
        });
        if (conflict) throw teamIdentityConflict();
        if (
          current.identityId !== team.id ||
          current.supplierId !== supplier.id
        ) {
          await assertNoProcessFactsForTeams([current.identityId, team.id], tx);
        }
        const updated = await tx.supplier_identity_links.update({
          where: { id },
          data: {
            identityId: team.id,
            identityNameSnapshot: team.dictKey,
            supplierId: supplier.id,
          },
          include: teamLinkInclude,
        });
        await MetricRefreshQueue.enqueueSupplierScores(
          tx,
          [current.supplierId, supplier.id],
          'supplier-identity.updated',
        );
        return updated;
      });
    } catch (error) {
      logger.error(
        { err: error, id, supplierId: input.supplierId, teamId: input.teamId },
        'failed to update supplier identity link',
      );
      if (isPrismaUniqueConstraintError(error)) {
        throw teamIdentityConflict();
      }
      throw error;
    }
  },
};
