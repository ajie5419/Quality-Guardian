import { AI_GENERATION_PERMISSION_CODES } from '@qgs/shared';
import { defineEventHandler, readBody } from 'h3';
import { callAi } from '~/modules/ai/ai';
import { authorizeWrite } from '~/modules/rbac';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  await authorizeWrite(event, AI_GENERATION_PERMISSION_CODES.GENERATE);
  const body = await readBody(event);
  const { statistics, year } = body;

  const systemPrompt = `你是一位制造企业的质量总监 (Quality Director)。
请根据提供的质量聚合统计数据，撰写一份简短、专业且具备行动导向的“质量月度洞察简报”。

输出要求：1) 使用 Markdown 格式；2) 包含现状总结（Pareto）、风险预警（高频部件）、管理建议；3) 语气严谨有洞察力；4) 300 字以内。`;

  const userPrompt = `年度：${year} 年
统计数据概览：
- 缺陷帕累托：${JSON.stringify(statistics.pareto)}
- 高频故障部件：${JSON.stringify(statistics.parts)}
- 总问题数：${statistics.totalCount}
- 累计质量损失：${statistics.totalLoss} RMB

请生成质量洞察报告。`;

  try {
    const aiResponse = await callAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.7 },
    );

    return useResponseSuccess({ report: aiResponse });
  } catch (error: unknown) {
    logApiError('generate-report', error, undefined, event);
    const axiosError = error as { message?: string };
    return internalServerErrorResponse(
      event,
      axiosError.message || '生成报告失败',
    );
  }
});
