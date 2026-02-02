import { defineEventHandler, readBody } from 'h3';
import { callAi, extractJson } from '~/utils/ai';
import { logApiError } from '~/utils/api-logger';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { description, defectType, partName } = body;

  const systemPrompt = `你是一位资深的工业质量管理专家。
你的任务是根据描述进行分析，并**严格**按照以下 JSON 格式返回：
{
  "rootCause": "这里填写深入的根本原因分析...",
  "solution": "这里填写具体的改进建议..."
}

注意：
1. 不要返回自定义的键名。
2. 不要包含任何解释性文字。
3. 如果分析出多个原因，请统一合并在 rootCause 字符串中，用换行或序号分隔。`;

  const userPrompt = `问题描述：${description}
缺陷类型：${defectType}
涉及部件：${partName || '未指定'}

请立即返回符合格式的分析结果。`;

  try {
    const aiResponse = await callAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0.3 },
    );

    const result = extractJson(aiResponse);

    // --- 语义聚合逻辑：处理 AI 不按套路出牌返回自定义 Key 的情况 ---
    let finalRootCause = '';
    let finalSolution = '';

    if (result.rootCause && typeof result.rootCause === 'string') {
      finalRootCause = result.rootCause;
      finalSolution = result.solution || '建议制定专项预防措施并加强过程检验。';
    } else {
      // 如果 AI 返回了像 {"materialIssue": "..."} 这样的自定义结构
      // 我们将其遍历并聚合为一段可读的文本
      const entries = Object.entries(result);
      finalRootCause = `AI 多维度分析结论：\n${entries
        .map(([_key, val]) => `• ${val}`)
        .join('\n')}`;
      finalSolution =
        '根据上述分析，建议：1. 针对识别出的主因进行全量复核；2. 优化相关环节的作业指导书；3. 组织班组内部质量复盘。';
    }

    return useResponseSuccess({
      rootCause: finalRootCause,
      solution: finalSolution,
    });
  } catch (error: unknown) {
    // ... 原有的错误处理 logic
    logApiError('analyze', error);
    const err = error as { message?: string };
    return {
      code: 500,
      message:
        typeof err.message === 'string'
          ? err.message
          : 'AI 分析过程中发生未知错误',
    };
  }
});
