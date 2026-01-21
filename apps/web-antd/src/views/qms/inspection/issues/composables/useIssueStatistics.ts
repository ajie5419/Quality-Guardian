import type { Ref } from 'vue';

import type {
  InspectionIssue,
  ParetoDataItem,
  PieDataItem,
  StatisticsData,
  TrendDataItem,
} from '../types';

import { computed } from 'vue';

import { InspectionIssueStatusEnum } from '#/api/qms/enums';
import { $t } from '#/locales';

/**
 * 质量问题统计逻辑 Composable
 */
export function useIssueStatistics(
  issues: Ref<InspectionIssue[]>,
  currentYear: Ref<number>,
) {
  const statistics = computed<StatisticsData>(() => {
    const data = issues.value || [];
    const totalCount = data.length;

    // 已关闭数量
    const closedCount = data.filter(
      (item) => item.status === InspectionIssueStatusEnum.CLOSED,
    ).length;

    // 未关闭数量 (总数 - 已关闭，包含 OPEN 和 IN_PROGRESS)
    const openCount = totalCount - closedCount;

    // 总损失金额
    const totalLoss = data.reduce(
      (sum, item) => sum + (Number(item.lossAmount) || 0),
      0,
    );

    // 关闭率
    const closedRate =
      totalCount > 0 ? Math.round((closedCount / totalCount) * 100) : 0;

    // 缺陷类型分布（饼图数据）
    const typeMap = new Map<string, number>();
    data.forEach((item) => {
      const type = item.defectType || $t('common.unknown');
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const pieData: PieDataItem[] = [...typeMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 月度趋势（折线图数据）
    const trendMap = new Map<string, number>();
    for (let i = 1; i <= 12; i++) {
      const monthKey = `${currentYear.value}-${String(i).padStart(2, '0')}`;
      trendMap.set(monthKey, 0);
    }

    data.forEach((item) => {
      if (item.reportDate) {
        const month = item.reportDate.slice(0, 7);
        const currentMonthValue = trendMap.get(month) || 0;
        trendMap.set(month, currentMonthValue + (Number(item.lossAmount) || 0));
      }
    });

    const trendData: TrendDataItem[] = [...trendMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, value]) => ({ period, value }));

    // 帕累托图数据（用于 AI 报告）
    let cumulativeCount = 0;
    const pareto: ParetoDataItem[] = pieData.map((item) => {
      cumulativeCount += item.value;
      return {
        label: item.name,
        value: item.value,
        percent:
          totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
        cumulativePercent:
          totalCount > 0 ? Math.round((cumulativeCount / totalCount) * 100) : 0,
      };
    });

    return {
      totalCount,
      openCount,
      closedCount,
      totalLoss,
      closedRate,
      pieData,
      trendData,
      pareto,
    };
  });

  return {
    statistics,
  };
}
