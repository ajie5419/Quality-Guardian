import { defineEventHandler, readBody } from 'h3';
import { useResponseError, useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { apiKey, baseUrl, model } = body;

  if (!apiKey || !baseUrl) {
    return useResponseError('API Key 和 Base URL 不能为空');
  }

  try {
    // 尝试调用 API 的 chat/completions 接口发送一个极简请求
    // 这是最通用的验证方式，因为有些供应商不一定开放 /models 接口
    const url = baseUrl.endsWith('/')
      ? `${baseUrl}chat/completions`
      : `${baseUrl}/chat/completions`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000); // 增加到 30秒超时

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model, // 使用用户输入的模型进行测试
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return useResponseSuccess({
        success: true,
        message: '连接测试成功：服务器响应正常',
      });
    } else {
      const errorMsg = await response.text();
      console.error('[AI-Test] Failed:', response.status, errorMsg);
      return useResponseError(
        `连接失败 (${response.status}): ${errorMsg.slice(0, 100)}`,
      );
    }
  } catch (error: unknown) {
    console.error('[AI-Test] Error:', error);
    const err = error as { message?: string; name?: string };
    if (err.name === 'AbortError') {
      return useResponseError(
        '连接超时：无法访问该 API 地址，请检查 Base URL 是否正确。',
      );
    }
    return useResponseError(`连接测试异常: ${err.message}`);
  }
});
