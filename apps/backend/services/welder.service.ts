import prisma from '~/utils/prisma';
import { hasWelderCodeField } from '~/utils/welder';

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
      where.team = { contains: team };
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
        { team: { contains: keyword } },
        { certificationNo: { contains: keyword } },
      ];
      if (supportsWelderCode) {
        searchOr.unshift({ welderCode: { contains: keyword } });
      }
      where.OR = searchOr;
    }

    const [total, items] = await Promise.all([
      prisma.welders.count({ where }),
      prisma.welders.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const allRows = await prisma.welders.findMany({
      where: { isDeleted: false },
      select: {
        certificationNo: true,
        examPassed: true,
        score: true,
      },
    });

    let totalScore = 0;
    for (const row of allRows) {
      totalScore += row.score || 0;
    }

    const stats = {
      averageScore: (totalScore / (allRows.length || 1)).toFixed(1),
      certifiedCount: allRows.filter((row) => !!row.certificationNo).length,
      examPassedCount: allRows.filter((row) => row.examPassed).length,
      total: allRows.length,
      warningCount: allRows.filter((row) => (row.score || 0) <= 6).length,
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
};
