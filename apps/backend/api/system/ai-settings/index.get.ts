import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';
import { useResponseSuccess } from '~/utils/response';

export default defineEventHandler(async () => {
  const settings = await prisma.system_settings.findUnique({
    where: { key: 'AI_CONFIGURATION' },
  });

  if (settings && settings.value) {
    try {
      const config = JSON.parse(settings.value);
      // 兼容旧数据格式
      if (!config.configs) {
        const oldProvider = config.provider || 'deepseek';
        const defaultConfig = {
          apiKey: config.apiKey || '',
          baseUrl: config.baseUrl || '',
          model: config.model || '',
          availableModels: config.availableModels || [],
        };
        return useResponseSuccess({
          provider: oldProvider,
          configs: {
            deepseek:
              oldProvider === 'deepseek'
                ? defaultConfig
                : {
                    apiKey: '',
                    baseUrl: 'https://api.deepseek.com',
                    model: 'deepseek-chat',
                    availableModels: ['deepseek-chat', 'deepseek-reasoner'],
                  },
            zhipu:
              oldProvider === 'zhipu'
                ? defaultConfig
                : {
                    apiKey: '',
                    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
                    model: 'glm-4-flash',
                    availableModels: ['glm-4', 'glm-4-flash'],
                  },
            openai:
              oldProvider === 'openai'
                ? defaultConfig
                : { apiKey: '', baseUrl: '', model: '', availableModels: [] },
          },
        });
      }
      return useResponseSuccess(config);
    } catch (error) {
      console.error('Failed to parse AI settings from DB', error);
    }
  }

  // 默认值
  return useResponseSuccess({
    provider: 'deepseek',
    configs: {
      deepseek: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-chat',
        availableModels: ['deepseek-chat', 'deepseek-reasoner'],
      },
      zhipu: {
        apiKey: '',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
        model: 'glm-4-flash',
        availableModels: ['glm-4', 'glm-4-plus', 'glm-4-flash'],
      },
      openai: {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        availableModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      },
    },
  });
});
