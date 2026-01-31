import type { ItpItem } from '@qgs/shared';
import type { UploadFile } from 'ant-design-vue';

import { requestClient } from '#/api/request';

import { QMS_API } from './constants';

/**
 * AI 生成检验计划
 */
export async function generateItpFromFiles(data: {
  fileContent?: string;
  fileList: UploadFile[];
  prompt?: string;
}) {
  // AI 生成可能较慢，设置更长的超时时间（如 5 分钟）
  return requestClient.post<ItpItem[]>(QMS_API.AI_GENERATE_ITP, data, {
    timeout: 300_000,
  });
}

/**
 * 导入生成的 ITP 到指定项目
 */
export async function importGeneratedItp(
  projectId: string,
  items: Partial<ItpItem>[],
) {
  return requestClient.post(QMS_API.PLANNING_ITP_IMPORT, { projectId, items });
}

/**
 * AI 提取技术标签
 */
export async function extractAiTags(content: string) {
  // AI 提取通常在 5-10 秒内
  return requestClient.post<string[]>(QMS_API.AI_EXTRACT_TAGS, { content });
}
