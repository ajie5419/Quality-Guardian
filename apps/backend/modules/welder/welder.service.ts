import { buildTeamContainsWhere } from '~/governance/master-data/team-resolver';
import prisma from '~/utils/prisma';

import {
  buildWelderCreateData,
  buildWelderUpdateData,
  hasWelderCodeField,
} from './welder';

export interface WelderQueryParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  team?: string;
  welderCode?: string;
  employmentStatus?: 'ON_DUTY' | 'RESIGNED';
}

interface WelderListResponse {
  items: Array<Record<string, unknown>>;
  stats?: {
    averageScore: number | string;
    certifiedCount: number;
    examPassedCount: number;
    total: number;
    warningCount: number;
  };
  total: number;
}

export const WelderService = {
  async create(body: Record<string, unknown>) {
    const createData = await buildWelderCreateData(body);
    if (!createData) throw new Error('MISSING_REQUIRED');
    return prisma.welders.create({ data: createData });
  },
  async update(id: string, body: Record<string, unknown>) {
    await prisma.welders.update({
      where: { id },
      data: await buildWelderUpdateData(body),
    });
  },
  async softDelete(id: string) {
    await prisma.welders.update({
      where: { id },
      data: { isDeleted: true, updatedAt: new Date() },
    });
  },
  async findAll(params: WelderQueryParams): Promise<WelderListResponse> {
    const supportsWelderCode = hasWelderCodeField();
    const {
      keyword,
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      team,
      welderCode,
      employmentStatus,
    } = params;

    const where: Record<string, unknown> = { isDeleted: false };
    if (team) {
      Object.assign(
        where,
        await buildTeamContainsWhere({
          keyword: team,
        }),
      );
    }
    if (supportsWelderCode && welderCode) {
      where.welderCode = { contains: welderCode };
    }
    if (employmentStatus) {
      where.employmentStatus = employmentStatus;
    }
    if (keyword) {
      const searchOr: Array<Record<string, unknown>> = [
        { name: { contains: keyword } },
        await buildTeamContainsWhere({
          keyword,
        }),
        { certificationNo: { contains: keyword } },
      ];
      if (supportsWelderCode) {
        searchOr.unshift({ welderCode: { contains: keyword } });
      }
      where.OR = searchOr;
    }

    const [
      total,
      items,
      allWelderCount,
      certifiedCount,
      examPassedCount,
      warningCount,
      averageScore,
    ] = await Promise.all([
      prisma.welders.count({ where }),
      prisma.welders.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.welders.count({ where: { isDeleted: false } }),
      prisma.welders.count({
        where: { isDeleted: false, certificationNo: { not: null } },
      }),
      prisma.welders.count({ where: { isDeleted: false, examPassed: true } }),
      prisma.welders.count({ where: { isDeleted: false, score: { lte: 6 } } }),
      prisma.welders.aggregate({
        where: { isDeleted: false },
        _avg: { score: true },
      }),
    ]);

    const stats = {
      averageScore: (averageScore._avg.score ?? 0).toFixed(1),
      certifiedCount,
      examPassedCount,
      total: allWelderCount,
      warningCount,
    };

    return {
      items: items.map((item) => ({
        ...item,
        certificationNo: item.certificationNo ?? null,
      })),
      stats,
      total,
    };
  },
  async importRows(items: Array<Record<string, unknown>>) {
    const rowErrors: Array<Record<string, unknown>> = [];
    let successCount = 0;
    const supportsWelderCode = hasWelderCodeField();
    for (const [index, item] of items.entries()) {
      try {
        const createData = await buildWelderCreateData(item);
        if (!createData) {
          rowErrors.push({
            key: String(item.name || ''),
            reason: '缺少必填字段: name/team',
            row: index + 1,
          });
          continue;
        }
        const welderCode = String(createData.welderCode || '').trim();
        if (supportsWelderCode && welderCode) {
          const { id: _id, ...baseUpdateData } = createData;
          await prisma.welders.upsert({
            where: { welderCode },
            update: {
              ...baseUpdateData,
              isDeleted: false,
              updatedAt: new Date(),
            },
            create: createData,
          });
        } else {
          await prisma.welders.create({ data: createData });
        }
        successCount++;
      } catch (error: unknown) {
        rowErrors.push({
          key: String(item.name || ''),
          reason: error instanceof Error ? error.message : '导入失败',
          row: index + 1,
        });
      }
    }
    return { rowErrors, successCount, totalCount: items.length };
  },
};
