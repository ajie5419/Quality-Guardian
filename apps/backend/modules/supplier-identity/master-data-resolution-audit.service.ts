import type { Prisma } from '@prisma/client';

import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

export type MasterDataResolutionStatus = 'IGNORED' | 'OPEN' | 'RESOLVED';

type ResolutionAuditClient = Pick<
  Prisma.TransactionClient,
  'unresolved_master_data_refs'
>;

function normalizeValue(value: unknown) {
  return String(value || '').trim();
}

export const MasterDataResolutionAuditService = {
  async get(id: string, client: ResolutionAuditClient = prisma) {
    return client.unresolved_master_data_refs.findFirst({
      where: { id: normalizeValue(id), isDeleted: false },
    });
  },

  async list(
    params: {
      entityType?: string;
      fieldName?: string;
      page?: number;
      pageSize?: number;
      status?: MasterDataResolutionStatus;
    } = {},
  ) {
    const page = Math.max(Number(params.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.pageSize) || 20, 1), 100);
    const where: Prisma.unresolved_master_data_refsWhereInput = {
      isDeleted: false,
      ...(params.entityType
        ? { entityType: normalizeValue(params.entityType) }
        : {}),
      ...(params.fieldName
        ? { fieldName: normalizeValue(params.fieldName) }
        : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.unresolved_master_data_refs.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.unresolved_master_data_refs.count({ where }),
    ]);
    return { items, total };
  },

  async resolve(
    params: {
      id: string;
      note: string;
      resolvedId: string;
    },
    client: ResolutionAuditClient = prisma,
  ) {
    const result = await client.unresolved_master_data_refs.updateMany({
      where: {
        id: normalizeValue(params.id),
        isDeleted: false,
        status: 'OPEN',
      },
      data: {
        resolutionNote: params.note.trim(),
        resolvedAt: new Date(),
        resolvedId: normalizeValue(params.resolvedId),
        status: 'RESOLVED',
      },
    });
    if (result.count !== 1) {
      throw new BusinessError(
        'MASTER_DATA_REFERENCE_CHANGED',
        'The unresolved reference was already handled or changed',
        409,
      );
    }
  },
};
