import prisma from './prisma';
import { AI_SETTINGS } from './system-data';

export interface AiMessage {
  role: 'assistant' | 'system' | 'user';
  content: string;
}

export async function getAiConfig() {
  const settings = await prisma.system_settings.findUnique({
    where: { key: 'AI_CONFIGURATION' },
  });

  let config;
  if (settings && settings.value) {
    config = JSON.parse(settings.value);
    // 如果是新版多供应商结构
    if (config.configs && config.provider) {
      const activeProvider = config.provider;
      config = config.configs[activeProvider];
    }
  }

  // 如果数据库没有配置，或者配置是空的/占位符，则回退到环境变量 (AI_SETTINGS)
  if (!config || !config.apiKey || config.apiKey.includes('xxx')) {
    return {
      apiKey: AI_SETTINGS.apiKey,
      baseUrl: AI_SETTINGS.baseUrl,
      model: AI_SETTINGS.model,
    };
  }

  return config;
}

export async function callAi(
  messages: AiMessage[],
  options: {
    max_tokens?: number;
    model?: string;
    temperature?: number;
    timeout?: number;
  } = {},
) {
  const config = await getAiConfig();

  if (!config || !config.apiKey || config.apiKey.includes('xxx')) {
    throw new Error('AI API Key 未配置，请先到系统设置中完善并保存。');
  }

  const { apiKey, baseUrl, model: configModel } = config;
  const targetModel = options.model || configModel;
  const url = baseUrl.endsWith('/')
    ? `${baseUrl}chat/completions`
    : `${baseUrl}/chat/completions`;

  // 针对 deepseek-reasoner (R1) 的特殊处理
  const isReasoner =
    targetModel.includes('reasoner') || targetModel.includes('r1');

  let finalMessages = [...messages];
  if (isReasoner) {
    const systemMsg = finalMessages.find((m) => m.role === 'system');
    if (systemMsg) {
      finalMessages = finalMessages.filter((m) => m.role !== 'system');
      const firstUserMsg = finalMessages.find((m) => m.role === 'user');
      if (firstUserMsg) {
        firstUserMsg.content = `${systemMsg.content}\n\n指令要求：\n${firstUserMsg.content}`;
      } else {
        finalMessages.unshift({ role: 'user', content: systemMsg.content });
      }
    }
  }

  // 设置请求超时 (默认 60 秒)
  const timeout = options.timeout || 60_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: targetModel,
        messages: finalMessages,
        temperature: isReasoner ? undefined : (options.temperature ?? 0.3),
        max_tokens: options.max_tokens || 4096,
        ...(!isReasoner && targetModel.includes('deepseek')
          ? { thinking: { type: 'disabled' } }
          : {}),
        stream: false,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI-Error] Status: ${response.status}`, errorText);
      throw new Error(
        `AI 服务返回错误 (${response.status}): ${errorText.slice(0, 200)}`,
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const reasoning = choice?.message?.reasoning_content;

    if (!content) {
      if (reasoning) return reasoning;
      if (choice?.finish_reason === 'content_filter') {
        throw new Error('AI 返回内容被内容安全过滤器拦截。');
      }
      throw new Error('AI 返回内容为空，请检查模型状态。');
    }

    return content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const err = error as { message?: string; name?: string };
    if (err.name === 'AbortError') {
      throw new Error(
        `AI 响应超时 (${timeout / 1000}s)，请尝试切换到非推理模型或精简描述。`,
      );
    }
    throw error;
  }
}

/**
 * 提取 JSON 块（增强版）
 */
export function extractJson(content: string) {
  if (!content) throw new Error('AI 未返回任何内容');

  // 清除可能存在的 Unicode 零宽字符或特殊空格
  const cleanContent = content.trim().replaceAll(/[\u200B-\u200D\uFEFF]/g, '');

  // 1. 尝试直接解析
  try {
    return JSON.parse(cleanContent);
  } catch {}

  // 2. 尝试从 Markdown 代码块提取 (支持 json 或无语言标记)
  const markdownRegex = /```(?:json)?([\s\S]*?)```/g;
  let match = markdownRegex.exec(cleanContent);
  while (match !== null) {
    try {
      return JSON.parse(match[1].trim());
    } catch {}
    match = markdownRegex.exec(cleanContent);
  }

  // 3. 尝试搜索第一个 { 和最后一个 } 之间的内容
  const firstBrace = cleanContent.indexOf('{');
  const lastBrace = cleanContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = cleanContent.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonStr);
    } catch {}
  }

  console.error('[AI-JSON-Parse-Error] Raw Content:', content);
  throw new Error('AI 返回数据格式异常，无法解析分析结果，请重试。');
}
