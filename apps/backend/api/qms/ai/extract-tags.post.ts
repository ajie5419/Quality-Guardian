import { defineEventHandler, readBody } from 'h3';
import { callAi, extractJson } from '~/utils/ai';
import { logApiError } from '~/utils/api-logger';
import {
  internalServerErrorResponse,
  useResponseSuccess,
} from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { content } = body;

  if (!content) {
    return useResponseSuccess([]);
  }

  const systemPrompt = `你是一个质量管理专家。请从以下提供的质量问题描述、原因分析或解决方案中，提取出 3 到 5 个核心关键词作为技术标签。

【要求】
1. 标签应精炼，通常为 2-4 个字（例如：“焊接裂纹”、“传感器失效”、“设计干涉”、“装配极性错误”、“PLC通讯异常”）。
2. 只输出纯 JSON 块，包含一个字符串数组，格式如下：
{
  "tags": ["标签1", "标签2", "标签3"]
}
3. 严禁输出任何 Markdown 标记以外的解释文字。`;

  const userMessage = `需要提取标签的内容：\n---\n${content}\n---`;

  try {
    const aiResponse = await callAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      {
        temperature: 0.3,
        max_tokens: 500,
      },
    );

    const result = extractJson(aiResponse);
    const tags = Array.isArray(result) ? result : result.tags || [];

    // 确保结果是数组且过滤掉非字符串
    const finalTags = (Array.isArray(tags) ? tags : [])
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim());

    return useResponseSuccess(finalTags);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logApiError('extract-tags', error);
    return internalServerErrorResponse(
      event,
      `AI 提取标签失败: ${errorMessage}`,
    );
  }
});
