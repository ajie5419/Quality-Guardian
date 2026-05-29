import type {
  FileListParams,
  FilePageResult,
  FileStorageStats,
  ScanMissingResult,
} from '@qgs/shared';

import prisma from '~/utils/prisma';
import { buildKeywordOr } from '~/utils/query-helpers';

import {
  getStorageStrategyForProvider,
  normalizeStorageProvider,
} from './storage-strategy';

export async function listFileAssets(
  params: FileListParams,
): Promise<FilePageResult> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
  const where: any = {};
  const keyword = String(params.keyword || '').trim();
  const keywordOr = buildKeywordOr(keyword, [
    'originalName',
    'storedName',
    'objectKey',
    'sha256',
  ] as const);
  if (keywordOr) Object.assign(where, keywordOr);
  if (params.status) where.status = String(params.status).toUpperCase();
  if (params.storageProvider) {
    where.storageProvider = String(params.storageProvider).toUpperCase();
  }
  if (params.uploadedBy) where.uploadedBy = String(params.uploadedBy);
  if (params.mimeType) where.mimeType = { contains: String(params.mimeType) };
  if (params.bizType || params.bizId || params.fieldName) {
    where.references = {
      some: {
        ...(params.bizType ? { bizType: params.bizType } : {}),
        ...(params.bizId ? { bizId: params.bizId } : {}),
        ...(params.fieldName ? { fieldName: params.fieldName } : {}),
      },
    };
  }

  const [items, total] = await Promise.all([
    prisma.file_assets.findMany({
      include: {
        _count: { select: { references: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
    }),
    prisma.file_assets.count({ where }),
  ]);

  return { items, total };
}

export async function getFileStorageStats(): Promise<FileStorageStats> {
  const [
    totalAgg,
    activeAgg,
    orphanCount,
    referencedCount,
    byStatus,
    byStorageProvider,
  ] = await Promise.all([
    prisma.file_assets.aggregate({
      _count: { id: true },
      _sum: { size: true },
    }),
    prisma.file_assets.aggregate({
      _count: { id: true },
      _sum: { size: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.file_assets.count({
      where: { references: { none: {} }, status: 'ACTIVE' },
    }),
    prisma.file_assets.count({
      where: { references: { some: {} }, status: 'ACTIVE' },
    }),
    prisma.file_assets.groupBy({
      _count: { id: true },
      _sum: { size: true },
      by: ['status'],
    }),
    prisma.file_assets.groupBy({
      _count: { id: true },
      _sum: { size: true },
      by: ['storageProvider'],
      where: { status: 'ACTIVE' },
    }),
  ]);

  return {
    activeCount: activeAgg._count.id,
    activeSize: Number(activeAgg._sum.size || 0),
    byStatus: byStatus.map((item) => ({
      count: item._count.id,
      size: Number(item._sum.size || 0),
      status: item.status,
    })),
    byStorageProvider: byStorageProvider.map((item) => ({
      count: item._count.id,
      size: Number(item._sum.size || 0),
      storageProvider: item.storageProvider,
    })),
    orphanCount,
    referencedCount,
    totalCount: totalAgg._count.id,
    totalSize: Number(totalAgg._sum.size || 0),
  };
}

export async function listOrphanFileAssets(params: {
  page?: number;
  pageSize?: number;
}): Promise<FilePageResult> {
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(params.pageSize || 20)));
  const where = {
    references: { none: {} },
    status: 'ACTIVE' as const,
  };
  const [items, total] = await Promise.all([
    prisma.file_assets.findMany({
      include: { _count: { select: { references: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where,
    }),
    prisma.file_assets.count({ where }),
  ]);
  return { items, total };
}

export async function scanMissingFileAssets(params: {
  limit?: number;
  markMissing?: boolean;
}): Promise<ScanMissingResult> {
  const limit = Math.max(1, Math.min(500, Number(params.limit || 100)));
  const files = await prisma.file_assets.findMany({
    orderBy: { createdAt: 'asc' },
    take: limit,
    where: { status: 'ACTIVE' },
  });
  const missingIds = [];

  for (const file of files) {
    const exists = await getStorageStrategyForProvider(
      normalizeStorageProvider(file.storageProvider),
    ).exists(file.objectKey);
    if (!exists) {
      missingIds.push(file.id);
    }
  }

  if (params.markMissing && missingIds.length > 0) {
    await prisma.file_assets.updateMany({
      data: { status: 'MISSING' },
      where: { id: { in: missingIds } },
    });
  }

  return {
    checked: files.length,
    marked: params.markMissing ? missingIds.length : 0,
    missingIds,
  };
}
