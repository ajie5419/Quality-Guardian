import { defineEventHandler, readBody } from 'h3';
import { callAi, extractJson } from '~/utils/ai';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { description, partName } = body;

  // 1. 获取历史案例 (排除当前正在处理的，如果存在 ID 的话)
  // 这里简单获取最近的 20 条相关或所有记录
  const historyIssues = await prisma.quality_records.findMany({
    where: {
      isDeleted: false,
      OR: [
        { partName: { contains: partName || '' } },
        { description: { contains: partName || '' } },
      ],
    },
    take: 15,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      partName: true,
      description: true,
      rootCause: true,
      solution: true,
      createdAt: true,
    },
  });

  if (historyIssues.length === 0) {
    return useResponseSuccess([]);
  }

  // 2. 利用 AI 进行语义匹配评分
  const systemPrompt = `你是一个质量数据分析专家。
请对比用户输入的“当前问题描述”与提供的“历史案例列表”，识别出语义上最相似的 3 个历史案例。
相似的判定标准：涉及相同的部件、类似的失效模式、或相似的根本原因。

输出要求：
1. 必须以 JSON 数组格式输出。
2. 数组每个元素包含：id (历史案例ID), similarityScore (0-100的匹配分), matchReason (匹配原因简述)。
3. 只返回最相关的 3 个。`;

  const userPrompt = `当前问题描述：${description}
涉及部件：${partName}

历史案例列表：
${historyIssues.map((h) => `ID: ${h.id}, 部件: ${h.partName}, 描述: ${h.description}`).join('\n---\n')}

请进行语义匹配分析并返回 JSON 数组。`;

  try {
    const aiResponse = await callAi(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { temperature: 0 },
    );

    let matches = extractJson(aiResponse);

    // 确保 matches 是数组
    if (!Array.isArray(matches)) {
      if (matches.matches && Array.isArray(matches.matches)) {
        matches = matches.matches;
      } else {
        console.error('[AI-Match-Format-Error] Expected array, got:', matches);
        matches = [];
      }
    }

    interface AiMatchResult {
      id: string;
      matchReason?: string;
      similarityScore?: number;
    }

    // 3. 将匹配信息与原始数据合并
    const result = (matches as AiMatchResult[])
      .map((match) => {
        if (!match || !match.id) return null;
        const original = historyIssues.find((h) => h.id === match.id);
        if (!original) return null;
        return {
          ...original,
          matchReason: match.matchReason || 'AI 识别到语义关联',
          similarityScore: match.similarityScore || 50,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const scoreA = (a as { similarityScore: number }).similarityScore || 0;
        const scoreB = (b as { similarityScore: number }).similarityScore || 0;
        return scoreB - scoreA;
      });

    return useResponseSuccess(result);
  } catch (error: unknown) {
    console.error('[AI-Match-Error]', error);
    // 如果 AI 失败，降级返回简单的数据库匹配
    return useResponseSuccess(
      historyIssues.slice(0, 3).map((h) => ({
        ...h,
        similarityScore: 50,
        matchReason: '基于关键词匹配 (AI 离线)',
      })),
    );
  }
});
