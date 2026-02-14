import type { StatisticsData } from '../types';

import { ref } from 'vue';

import { getInspectionIssueStats } from '#/api/qms/inspection';
import { useErrorHandler } from '#/hooks/useErrorHandler';

export function useIssueRemoteStatistics() {
  const { handleApiError } = useErrorHandler();
  const statistics = ref<StatisticsData>({
    totalCount: 0,
    openCount: 0,
    closedCount: 0,
    totalLoss: 0,
    closedRate: 0,
    pieData: [],
    trendData: [],
    pareto: [],
  });

  async function fetchStatistics(year: number) {
    try {
      const res = await getInspectionIssueStats({ year });
      let cumulativeCount = 0;
      const totalCount = res.totalCount || 0;
      const pareto = (res.pieData || []).map((item) => {
        cumulativeCount += item.value;
        return {
          label: item.name,
          value: item.value,
          percent:
            totalCount > 0 ? Math.round((item.value / totalCount) * 100) : 0,
          cumulativePercent:
            totalCount > 0
              ? Math.round((cumulativeCount / totalCount) * 100)
              : 0,
        };
      });

      statistics.value = { ...res, pareto };
    } catch (error) {
      handleApiError(error, 'Fetch Issue Statistics');
    }
  }

  return {
    statistics,
    fetchStatistics,
  };
}
