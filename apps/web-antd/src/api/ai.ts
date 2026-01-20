import type {
  AnalyzeQualityIssueParams,
  AnalyzeQualityIssueResponse,
  GenerateQualityInsightParams,
  GenerateQualityInsightResponse,
  MatchedCase,
  MatchHistoryCasesParams,
} from '#/types/api/ai';

import { requestClient } from '#/api/request';

import { AI_API } from './ai-constants';

/**
 * 智能根因分析
 */
export async function analyzeQualityIssue(params: AnalyzeQualityIssueParams) {
  // 针对 AI 分析延长前端超时至 60 秒
  return requestClient.post<AnalyzeQualityIssueResponse>(
    AI_API.ANALYZE,
    params,
    { timeout: 60_000 },
  );
}

/**
 * 历史案例匹配 (RAG)
 */
export async function matchHistoryCases(params: MatchHistoryCasesParams) {
  return requestClient.post<MatchedCase[]>(AI_API.MATCH_CASES, params, {
    timeout: 60_000,
  });
}

/**
 * 生成质量洞察报告
 */
export async function generateQualityInsight(
  params: GenerateQualityInsightParams,
) {
  return requestClient.post<GenerateQualityInsightResponse>(
    AI_API.GENERATE_REPORT,
    params,
    {
      timeout: 60_000,
    },
  );
}
