/**
 * AI API 类型定义
 */

/**
 * 质量问题分析请求参数
 */
export interface AnalyzeQualityIssueParams {
  description: string;
  defectType?: string;
  partName?: string;
}

/**
 * 质量问题分析响应
 */
export interface AnalyzeQualityIssueResponse {
  rootCause: string;
  suggestions: string[];
  relatedFactors?: string[];
  confidence?: number;
}

/**
 * 历史案例匹配请求参数
 */
export interface MatchHistoryCasesParams {
  description: string;
  partName?: string;
}

/**
 * 匹配到的历史案例
 */
export interface MatchedCase {
  createdAt?: string;
  description: string;
  id: string;
  ncNumber?: string;
  rootCause?: string;
  similarity: number;
  solution: string;
  title: string;
}

/**
 * 质量洞察报告统计数据
 */
export interface QualityStatistics {
  passRate: number;
  qualityLoss: number;
  topDefects: Array<{
    count: number;
    percentage: number;
    type: string;
  }>;
  totalInspections: number;
  trendData?: Array<{
    period: string;
    value: number;
  }>;
}

/**
 * 生成质量报告请求参数
 */
export interface GenerateQualityInsightParams {
  statistics: QualityStatistics;
  year: number;
}

/**
 * 生成质量报告响应
 */
export interface GenerateQualityInsightResponse {
  report: string;
}
