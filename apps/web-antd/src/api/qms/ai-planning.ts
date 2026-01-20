import type { UploadFile } from 'ant-design-vue';

import type { QmsPlanningApi } from './planning';

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
  return requestClient.post<QmsPlanningApi.ItpItem[]>(
    QMS_API.AI_GENERATE_ITP,
    data,
    {
      timeout: 300_000,
    },
  );
}

/**
 * 导入生成的 ITP 到指定项目
 */
export async function importGeneratedItp(
  projectId: string,
  items: Partial<QmsPlanningApi.ItpItem>[],
) {
  return requestClient.post(QMS_API.PLANNING_ITP_IMPORT, { projectId, items });
}
