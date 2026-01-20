import { requestClient } from '#/api/request';

export namespace SystemAiApi {
  export interface ProviderConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
    availableModels: string[];
  }

  export interface AiSetting {
    provider: 'deepseek' | 'openai' | 'zhipu';
    // 存储每个供应商的独立配置
    configs: {
      deepseek: ProviderConfig;
      openai: ProviderConfig;
      zhipu: ProviderConfig;
    };
  }
}

/**
 * 获取 AI 设置
 */
export async function getAiSetting() {
  return requestClient.get<SystemAiApi.AiSetting>('/system/ai-settings');
}

/**
 * 保存 AI 设置
 */
export async function updateAiSetting(data: SystemAiApi.AiSetting) {
  return requestClient.post('/system/ai-settings', data);
}

/**
 * 测试 AI 连接
 */
export async function testAiConnection(data: {
  apiKey: string;
  baseUrl: string;
  model: string;
  provider: string;
}) {
  return requestClient.post('/system/ai-settings/test', data);
}
