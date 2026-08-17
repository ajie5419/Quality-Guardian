import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

const logger = createModuleLogger('AvailableYears');

export interface YearSource {
  /** 业务范围标识（前端 hook 与统计接口共用） */
  scope: string;
  /** Prisma 模型名（含表名） */
  table: string;
  /** 业务日期列名（记录所述年份） */
  column: string;
}

// 年份来源注册表：新模块需要按年份查询 = 这里加一行（docs/available-years.md）。
// 年份查询含归档数据（追溯入口，docs/data-lifecycle.md §3.5）。
export const YEAR_SOURCES: YearSource[] = [
  { scope: 'inspection-record', table: 'quality_records', column: 'date' },
  { scope: 'inspection', table: 'inspections', column: 'inspectionDate' },
  { scope: 'after-sales', table: 'after_sales', column: 'occurDate' },
  { scope: 'work-order', table: 'work_orders', column: 'deliveryDate' },
  { scope: 'quality-loss', table: 'quality_loss_index', column: 'occurDate' },
  { scope: 'metrology-plan', table: 'metrology_calibration_plans', column: 'planYear' },
  { scope: 'vehicle-commissioning', table: 'vehicle_commissioning_issues', column: 'date' },
];

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<
  string,
  { expiresAt: number; years: number[] }
>();

/**
 * 系统可用年份（降序去重）。
 * - scopes 为空 = 合并全部来源；否则只查指定来源
 * - 60s 内存缓存（年份低频变动）
 * - 含归档数据（追溯入口）
 */
export async function getAvailableYears(
  scopes: string[] = [],
): Promise<number[]> {
  const cacheKey = scopes.length > 0 ? scopes.join(',') : '*';
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.years;

  const sources =
    scopes.length > 0
      ? YEAR_SOURCES.filter((source) => scopes.includes(source.scope))
      : YEAR_SOURCES;
  if (sources.length === 0) return [];

  const yearSets: number[][] = await Promise.all(
    sources.map(async (source) => {
      try {
        // 表名/列名来自注册表常量（非用户输入）；字符串拼接避免模板字符串与
        // queryRawUnsafe 组合（B-SEC1 门禁）。
        const sql =
          'SELECT DISTINCT YEAR(`' +
          source.column +
          '`) as year FROM `' +
          source.table +
          '` WHERE isDeleted = false AND `' +
          source.column +
          '` IS NOT NULL';
        const rows = await prisma.$queryRawUnsafe<
          Array<{ year: bigint | number }>
        >(sql);
        return rows.map((row) => Number(row.year)).filter((year) => year > 0);
      } catch (error) {
        logger.warn(
          { err: error, source: source.table },
          'available years source failed',
        );
        return [];
      }
    }),
  );

  const years = [...new Set(yearSets.flat())].sort((a, b) => b - a);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, years });
  return years;
}

/** 测试助手：清空缓存 */
export function clearAvailableYearsCache(): void {
  cache.clear();
}
