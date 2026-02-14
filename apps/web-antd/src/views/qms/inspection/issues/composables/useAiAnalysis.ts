import type { Ref } from 'vue';

import type { MatchedCase } from '../types';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { analyzeQualityIssue, matchHistoryCases } from '#/api/ai';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface AiFormState {
  defectType?: string;
  description?: string;
  partName?: string;
  rootCause?: string;
  solution?: string;
}

interface UseAiAnalysisOptions {
  formState: Ref<AiFormState>;
}

/**
 * AI 分析 composable
 */
export function useAiAnalysis(options: UseAiAnalysisOptions) {
  const { formState } = options;
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();

  const isAiAnalyzing = ref(false);
  const isMatchingCases = ref(false);
  const matchedCases = ref<MatchedCase[]>([]);

  /**
   * AI 分析问题原因和解决方案
   */
  async function analyzeIssue() {
    if (!formState.value.description) {
      message.warning(t('qms.inspection.issues.descriptionPlaceholder'));
      return;
    }

    isAiAnalyzing.value = true;
    try {
      const res = await analyzeQualityIssue({
        defectType: formState.value.defectType,
        description: formState.value.description,
        partName: formState.value.partName,
      });

      if (res) {
        const rootCause =
          typeof res.rootCause === 'string'
            ? res.rootCause
            : JSON.stringify(res.rootCause || '');
        const solution =
          typeof res.suggestions === 'object' && Array.isArray(res.suggestions)
            ? res.suggestions.join('\n')
            : String(res.suggestions || '');

        formState.value.rootCause = rootCause;
        formState.value.solution = solution;
        message.success(t('qms.inspection.issues.aiAnalysisComplete'));
      }
    } catch (error: unknown) {
      handleApiError(error, 'AI Analyze Issue');
      const errorMessage =
        error instanceof Error ? error.message : t('common.actionFailed');
      message.error(errorMessage);
      throw error;
    } finally {
      isAiAnalyzing.value = false;
    }
  }

  /**
   * 匹配历史相似案例
   */
  async function matchHistory() {
    if (!formState.value.description) {
      message.warning(t('qms.inspection.issues.descriptionPlaceholder'));
      return;
    }

    isMatchingCases.value = true;
    try {
      const res = await matchHistoryCases({
        description: formState.value.description,
        partName: formState.value.partName,
      });
      matchedCases.value = res || [];
      if (matchedCases.value.length === 0) {
        message.info(t('common.noData'));
      } else {
        message.success(t('qms.inspection.issues.matchCasesSuccess'));
      }
    } catch (error) {
      handleApiError(error, 'AI Match History Cases');
      const errorMessage =
        error instanceof Error ? error.message : t('common.actionFailed');
      message.error(errorMessage);
      throw error;
    } finally {
      isMatchingCases.value = false;
    }
  }

  /**
   * 应用相似案例的解决方案
   */
  function applyCaseSolution(caseItem: MatchedCase) {
    formState.value.rootCause = caseItem.rootCause;
    formState.value.solution = caseItem.solution;
    message.success(t('qms.inspection.issues.caseReferenced'));
  }

  /**
   * 清空匹配案例
   */
  function clearMatchedCases() {
    matchedCases.value = [];
  }

  return {
    isAiAnalyzing,
    isMatchingCases,
    matchedCases,
    analyzeIssue,
    matchHistory,
    applyCaseSolution,
    clearMatchedCases,
  };
}
