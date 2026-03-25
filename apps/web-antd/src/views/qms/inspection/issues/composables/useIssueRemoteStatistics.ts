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

  async function fetchStatistics(params: {
    dateMode: 'month' | 'week' | 'year';
    dateValue: string;
    year: number;
  }) {
    try {
      const res = await getInspectionIssueStats(params);
      statistics.value = res;
    } catch (error) {
      handleApiError(error, 'Fetch Issue Statistics');
    }
  }

  return {
    statistics,
    fetchStatistics,
  };
}
