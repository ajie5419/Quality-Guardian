import type { inspection_category, Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

export interface SupplierIdentityInput {
  supplierId: string;
  teamId: string;
}

function normalizeId(value: unknown) {
  return String(value || '').trim();
}

async function validateLinkInput(input: SupplierIdentityInput) {
  const supplierId = normalizeId(input.supplierId);
  const teamId = normalizeId(input.teamId);
  if (!supplierId || !teamId) {
    throw new BusinessError('VALIDATION', 'supplierId and teamId are required');
  }
  const [supplier, team] = await Promise.all([
    prisma.suppliers.findFirst({
      select: { id: true, name: true },
      where: { id: supplierId, isDeleted: false },
    }),
    prisma.dictionaries.findFirst({
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

export const SupplierIdentityService = {
  async create(input: SupplierIdentityInput) {
    const { supplier, team } = await validateLinkInput(input);
    const existing = await prisma.supplier_identity_links.findUnique({
      where: {
        identityType_identityId: { identityId: team.id, identityType: 'TEAM' },
      },
    });
    if (
      existing &&
      !existing.isDeleted &&
      existing.supplierId !== supplier.id
    ) {
      throw new BusinessError(
        'TEAM_IDENTITY_CONFLICT',
        'TEAM is already linked to another supplier',
        409,
      );
    }
    return prisma.supplier_identity_links.upsert({
      where: {
        identityType_identityId: { identityId: team.id, identityType: 'TEAM' },
      },
      create: {
        identityId: team.id,
        identityNameSnapshot: team.dictKey,
        identityType: 'TEAM',
        supplierId: supplier.id,
      },
      update: {
        identityNameSnapshot: team.dictKey,
        isDeleted: false,
        supplierId: supplier.id,
      },
      include: linkInclude,
    });
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
    const current = await prisma.supplier_identity_links.findFirst({
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
    const { supplier, team } = await validateLinkInput(input);
    const conflict = await prisma.supplier_identity_links.findFirst({
      select: { id: true },
      where: {
        id: { not: id },
        identityId: team.id,
        identityType: 'TEAM',
        isDeleted: false,
      },
    });
    if (conflict) {
      throw new BusinessError(
        'TEAM_IDENTITY_CONFLICT',
        'TEAM is already linked to another supplier',
        409,
      );
    }
    return prisma.supplier_identity_links.update({
      where: { id },
      data: {
        identityId: team.id,
        identityNameSnapshot: team.dictKey,
        supplierId: supplier.id,
      },
      include: linkInclude,
    });
  },
};
