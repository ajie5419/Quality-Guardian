/**
 * Extract JSON payload from AI free-form response content.
 */
export function extractAiJson(content: string): any {
  if (!content) throw new Error('AI 未返回任何内容');

  const cleanContent = content.trim().replaceAll(/[\u200B-\u200D\uFEFF]/g, '');

  try {
    return JSON.parse(cleanContent);
  } catch {}

  const markdownRegex = /```(?:json)?([\s\S]*?)```/g;
  let match = markdownRegex.exec(cleanContent);
  while (match !== null) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
    match = markdownRegex.exec(cleanContent);
  }

  const firstBrace = cleanContent.indexOf('{');
  const lastBrace = cleanContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleanContent.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {}
  }

  throw new Error('AI 返回数据格式异常，无法解析分析结果，请重试。');
}
