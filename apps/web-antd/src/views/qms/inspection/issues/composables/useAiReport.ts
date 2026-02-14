import type { StatisticsData } from '../types';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import { generateQualityInsight } from '#/api/ai';
import { useErrorHandler } from '#/hooks/useErrorHandler';

/**
 * AI 洞察报告 Composable
 */
export function useAiReport() {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();
  const isGeneratingInsight = ref(false);

  /**
   * 生成 AI 洞察报告
   */
  async function generateReport(
    statistics: StatisticsData,
    currentYear: number,
  ) {
    isGeneratingInsight.value = true;
    try {
      const response = await generateQualityInsight({
        statistics: {
          passRate: statistics.closedRate,
          qualityLoss: statistics.totalLoss,
          topDefects: statistics.pareto.map((p) => ({
            type: p.label,
            count: p.value,
            percentage: p.percent,
          })),
          totalInspections: statistics.totalCount,
          trendData: statistics.trendData.map((t) => ({
            period: t.period,
            value: t.value,
          })),
        },
        year: currentYear,
      });

      Modal.info({
        title: t('qms.inspection.issues.aiInsightReport'),
        width: 600,
        content: response.report,
      });
    } catch (error) {
      handleApiError(error, 'Generate AI Insight Report');
      const errorMessage =
        error instanceof Error ? error.message : t('common.actionFailed');
      message.error(errorMessage);
      throw error;
    } finally {
      isGeneratingInsight.value = false;
    }
  }

  return {
    isGeneratingInsight,
    generateReport,
  };
}
