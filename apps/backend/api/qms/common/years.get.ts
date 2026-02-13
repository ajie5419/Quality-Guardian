import { defineEventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import prisma from '~/utils/prisma';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  try {
    // 使用原生 SQL 获取所有工单交付日期的去重年份
    // 之前已经在 schema.prisma 中为 deliveryDate 建立了索引，查询效率极高
    interface YearRow {
      year: bigint | number;
    }
    const result = (await prisma.$queryRaw`
      SELECT DISTINCT YEAR(deliveryDate) as year 
      FROM work_orders 
      WHERE isDeleted = false 
      ORDER BY year DESC
    `) as YearRow[];

    // 如果数据库为空，默认返回当前年份，确保 UI 稳定性
    const currentYear = new Date().getFullYear();
    const years =
      result.length > 0
        ? result.map((r) => Number(r.year)).filter((y) => y > 0)
        : [currentYear];

    // 再次去重并排序（防御性处理）
    const uniqueYears = [...new Set(years)].sort((a, b) => b - a);

    return useResponseSuccess(uniqueYears);
  } catch (error) {
    logApiError('years', error);
    return internalServerErrorResponse(event, 'Failed to fetch available years');
  }
});
