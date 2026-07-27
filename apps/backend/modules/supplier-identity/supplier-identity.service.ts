import type { inspection_category, Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';
import { isPrismaUniqueConstraintError } from '~/utils/prisma-error';

export interface SupplierIdentityInput {
  supplierId: string;
  teamId: string;
}

const logger = createModuleLogger('SupplierIdentityService');

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

async function validateLinkInput(
  input: SupplierIdentityInput,
  client: Pick<Prisma.TransactionClient, 'dictionaries' | 'suppliers'>,
) {
  const supplierId = normalizeId(input.supplierId);
  const teamId = normalizeId(input.teamId);
  if (!supplierId || !teamId) {
    throw new BusinessError('VALIDATION', 'supplierId and teamId are required');
  }
  const [supplier, team] = await Promise.all([
    client.suppliers.findFirst({
      select: { id: true, name: true },
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
  return { supplier, team };
}

const linkInclude = {
  supplier: {
    select: { id: true, isDeleted: true, name: true },
  },
} satisfies Prisma.supplier_identity_linksInclude;

function teamIdentityConflict() {
  return new BusinessError(
    'TEAM_IDENTITY_CONFLICT',
    'TEAM is already linked to another supplier',
    409,
  );
}

export const SupplierIdentityService = {
  async assertTeamCanBeRetired(teamId: string) {
    const activeLink = await prisma.supplier_identity_links.findFirst({
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
        if (existing) {
          return tx.supplier_identity_links.update({
            where: { id: existing.id },
            data: {
              identityNameSnapshot: team.dictKey,
              isDeleted: false,
              supplierId: supplier.id,
            },
            include: linkInclude,
          });
        }
        return tx.supplier_identity_links.create({
          data: {
            identityId: team.id,
            identityNameSnapshot: team.dictKey,
            identityType: 'TEAM',
            supplierId: supplier.id,
          },
          include: linkInclude,
        });
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

  async delete(id: string) {
    const existing = await prisma.supplier_identity_links.findFirst({
      select: { id: true },
      where: { id, isDeleted: false },
    });
    if (!existing) {
      throw new BusinessError(
        'NOT_FOUND',
        'Supplier identity link not found',
        404,
      );
    }
    return prisma.supplier_identity_links.update({
      where: { id },
      data: { isDeleted: true },
    });
  },

  async list(params: { page?: number; pageSize?: number } = {}) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where = { isDeleted: false } as const;
    const [items, total] = await Promise.all([
      prisma.supplier_identity_links.findMany({
        where,
        include: linkInclude,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplier_identity_links.count({ where }),
    ]);
    return { items, total };
  },

  async resolveSupplierById(supplierId: null | string | undefined) {
    const id = normalizeId(supplierId);
    if (!id) return null;
    const supplier = await prisma.suppliers.findFirst({
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

  async resolveSupplierByTeamId(teamId: null | string | undefined) {
    const id = normalizeId(teamId);
    if (!id) return null;
    const link = await prisma.supplier_identity_links.findFirst({
      where: {
        identityId: id,
        identityType: 'TEAM',
        isDeleted: false,
        supplier: { is: { isDeleted: false } },
      },
      include: linkInclude,
    });
    if (!link || link.supplier.isDeleted) return null;
    return { id: link.supplier.id, name: link.supplier.name };
  },

  async resolveSuppliersByTeamIds(
    teamIds: ReadonlyArray<null | string | undefined>,
  ) {
    const ids = [
      ...new Set(teamIds.map((teamId) => normalizeId(teamId)).filter(Boolean)),
    ];
    if (ids.length === 0) {
      return new Map<string, { id: string; name: string }>();
    }
    const links = await prisma.supplier_identity_links.findMany({
      where: {
        identityId: { in: ids },
        identityType: 'TEAM',
        isDeleted: false,
        supplier: { is: { isDeleted: false } },
      },
      include: linkInclude,
    });
    return new Map(
      links
        .filter((link) => !link.supplier.isDeleted)
        .map((link) => [
          link.identityId,
          { id: link.supplier.id, name: link.supplier.name },
        ]),
    );
  },

  async resolveTeamById(teamId: null | string | undefined) {
    const id = normalizeId(teamId);
    if (!id) return null;
    const team = await prisma.dictionaries.findFirst({
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

  async resolveSupplierForInspection(input: {
    category: inspection_category | string;
    supplierId?: null | string;
    teamId?: null | string;
  }) {
    const explicitSupplier = await this.resolveSupplierById(input.supplierId);
    if (input.category !== 'PROCESS') return explicitSupplier;
    const teamSupplier = await this.resolveSupplierByTeamId(input.teamId);
    if (
      explicitSupplier &&
      teamSupplier &&
      explicitSupplier.id !== teamSupplier.id
    ) {
      throw new BusinessError(
        'SUPPLIER_IDENTITY_MISMATCH',
        'Supplier ID does not match the linked TEAM identity',
      );
    }
    return explicitSupplier || teamSupplier;
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
        const { supplier, team } = await validateLinkInput(input, tx);
        const current = await tx.supplier_identity_links.findFirst({
          select: { id: true },
          where: { id, isDeleted: false },
        });
        if (!current) {
          throw new BusinessError(
            'NOT_FOUND',
            'Supplier identity link not found',
            404,
          );
        }
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
        return tx.supplier_identity_links.update({
          where: { id },
          data: {
            identityId: team.id,
            identityNameSnapshot: team.dictKey,
            supplierId: supplier.id,
          },
          include: linkInclude,
        });
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
