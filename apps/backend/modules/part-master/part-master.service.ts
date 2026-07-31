import type { Prisma } from '@prisma/client';

import type {
  PartMasterCreateInput,
  PartMasterManagementQuery,
  PartMasterRemoteSearchInput,
  PartMasterUpdateInput,
} from './part-master.schema';

import { createId } from '@paralleldrive/cuid2';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

type PartMasterClient = Pick<Prisma.TransactionClient, 'master_parts'>;

const partSelect = {
  id: true,
  name: true,
  sort: true,
  status: true,
} satisfies Prisma.master_partsSelect;

async function assertNameAvailable(
  db: PartMasterClient,
  name: string,
  excludedId?: string,
) {
  const existing = await db.master_parts.findFirst({
    where: {
      ...(excludedId ? { id: { not: excludedId } } : {}),
      name,
    },
    select: { id: true },
  });
  if (existing) {
    throw new BusinessError(
      'PART_NAME_CONFLICT',
      'A material with this name already exists',
      409,
    );
  }
}

async function restoreDeletedPart(
  db: PartMasterClient,
  id: string,
  input: PartMasterCreateInput,
) {
  const updated = await db.master_parts.updateMany({
    where: { id, isDeleted: true },
    data: { isDeleted: false, sort: input.sort ?? 0, status: 1 },
  });
  if (updated.count === 0) {
    throw new BusinessError(
      'PART_NAME_CONFLICT',
      'A material with this name already exists',
      409,
    );
  }
  const restored = await db.master_parts.findUnique({
    where: { id },
    select: partSelect,
  });
  if (!restored) {
    throw new BusinessError('PART_NOT_FOUND', 'Material not found', 404);
  }
  return restored;
}

async function createWithClient(
  db: PartMasterClient,
  input: PartMasterCreateInput,
) {
  const name = input.name.trim();
  const existing = await db.master_parts.findUnique({
    where: { name },
    select: { id: true, isDeleted: true },
  });
  if (existing && !existing.isDeleted) {
    throw new BusinessError(
      'PART_NAME_CONFLICT',
      'A material with this name already exists',
      409,
    );
  }
  if (existing) return restoreDeletedPart(db, existing.id, input);
  return db.master_parts.create({
    data: {
      id: createId(),
      isDeleted: false,
      name,
      sort: input.sort ?? 0,
      status: 1,
    },
    select: partSelect,
  });
}

export const PartMasterService = {
  async seedMissingNames(names: string[]) {
    const uniqueNames = [
      ...new Set(
        names.map((name) => name.trim()).filter((name) => name.length > 0),
      ),
    ];
    if (uniqueNames.length === 0) return 0;
    const result = await prisma.master_parts.createMany({
      data: uniqueNames.map((name, sort) => ({
        id: createId(),
        isDeleted: false,
        name,
        sort,
        status: 1,
      })),
      skipDuplicates: true,
    });
    return result.count;
  },

  async searchActive(input: PartMasterRemoteSearchInput) {
    const keyword = input.keyword.trim();
    if (!keyword) {
      throw new BusinessError(
        'PART_SEARCH_KEYWORD_REQUIRED',
        'A material search keyword is required',
        400,
      );
    }
    return prisma.master_parts.findMany({
      where: {
        isDeleted: false,
        name: { contains: keyword },
        status: 1,
      },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      take: Math.min(input.take, 50),
      select: { id: true, name: true },
    });
  },

  async assertActive(id: string, db: PartMasterClient = prisma) {
    const part = await db.master_parts.findFirst({
      where: { id, isDeleted: false, status: 1 },
      select: { id: true, name: true },
    });
    if (!part) {
      throw new BusinessError(
        'PART_NOT_AVAILABLE',
        'The selected material is not active',
        400,
      );
    }
    return part;
  },

  async findActiveByExactName(name: string, db: PartMasterClient = prisma) {
    const normalizedName = name.trim();
    if (!normalizedName) return null;
    const parts = await db.master_parts.findMany({
      where: { name: normalizedName, isDeleted: false, status: 1 },
      select: { id: true, name: true },
      take: 2,
    });
    return parts.length === 1 ? parts[0] : null;
  },

  async resolveOrCreateActive(
    input: { name: string; partId?: null | string },
    db: PartMasterClient = prisma,
  ) {
    const partId = input.partId?.trim();
    if (partId) return this.assertActive(partId, db);

    const name = input.name.trim();
    const existing = await db.master_parts.findUnique({
      where: { name },
      select: { id: true, isDeleted: true, name: true, status: true },
    });
    if (existing && !existing.isDeleted && existing.status === 1) {
      return { id: existing.id, name: existing.name };
    }
    if (existing && !existing.isDeleted) {
      throw new BusinessError(
        'PART_NOT_AVAILABLE',
        'The existing material is not active',
        400,
      );
    }
    return createWithClient(db, { name, sort: 0 });
  },

  async listForManagement(query: PartMasterManagementQuery) {
    const where: Prisma.master_partsWhereInput = {
      isDeleted: false,
      ...(query.keyword ? { name: { contains: query.keyword.trim() } } : {}),
      ...(query.status === undefined ? {} : { status: query.status }),
    };
    const [items, total] = await Promise.all([
      prisma.master_parts.findMany({
        where,
        orderBy: [{ sort: 'asc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: partSelect,
      }),
      prisma.master_parts.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  },

  async create(input: PartMasterCreateInput, db?: Prisma.TransactionClient) {
    if (db) return createWithClient(db, input);
    return prisma.$transaction((tx) => createWithClient(tx, input));
  },

  async update(id: string, input: PartMasterUpdateInput) {
    const existing = await prisma.master_parts.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    });
    if (!existing) {
      throw new BusinessError('PART_NOT_FOUND', 'Material not found', 404);
    }
    const name = input.name?.trim();
    if (name) await assertNameAvailable(prisma, name, id);
    return prisma.master_parts.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(input.sort === undefined ? {} : { sort: input.sort }),
        ...(input.status === undefined ? {} : { status: input.status }),
      },
      select: partSelect,
    });
  },

  async remove(id: string) {
    const result = await prisma.master_parts.updateMany({
      where: { id, isDeleted: false },
      data: { isDeleted: true, status: 0 },
    });
    if (result.count === 0) {
      throw new BusinessError('PART_NOT_FOUND', 'Material not found', 404);
    }
  },
};
