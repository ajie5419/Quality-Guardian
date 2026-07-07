import prisma from '~/utils/prisma';

import { SystemMonitoringService } from './system-monitoring.service';

export const SystemService = {
  async getSettingValue(key: string) {
    const setting = await prisma.system_settings.findUnique({
      where: { key },
    });
    return setting?.value || null;
  },

  async saveSettingValue(params: {
    description?: string;
    key: string;
    value: string;
  }) {
    await prisma.system_settings.upsert({
      where: { key: params.key },
      update: { value: params.value, updatedAt: new Date() },
      create: {
        key: params.key,
        value: params.value,
        description: params.description,
      },
    });
  },

  getDefaultAiConfig() {
    return {
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
    };
  },

  async getAiSettings() {
    const settings = await prisma.system_settings.findUnique({
      where: { key: 'AI_CONFIGURATION' },
    });
    if (!settings?.value) return this.getDefaultAiConfig();
    try {
      const config = JSON.parse(settings.value);
      if (config.configs) return config;
      const oldProvider = config.provider || 'deepseek';
      const defaultConfig = {
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        availableModels: config.availableModels || [],
      };
      const defaults = this.getDefaultAiConfig();
      return {
        provider: oldProvider,
        configs: {
          deepseek:
            oldProvider === 'deepseek'
              ? defaultConfig
              : defaults.configs.deepseek,
          zhipu:
            oldProvider === 'zhipu' ? defaultConfig : defaults.configs.zhipu,
          openai:
            oldProvider === 'openai' ? defaultConfig : defaults.configs.openai,
        },
      };
    } catch {
      return this.getDefaultAiConfig();
    }
  },

  async saveAiSettings(config: unknown) {
    await prisma.system_settings.upsert({
      where: { key: 'AI_CONFIGURATION' },
      update: { value: JSON.stringify(config), updatedAt: new Date() },
      create: {
        key: 'AI_CONFIGURATION',
        value: JSON.stringify(config),
        updatedAt: new Date(),
      },
    });
  },
  async getServerMetrics() {
    return SystemMonitoringService.getServerMetrics();
  },

  async getDatabaseMetrics() {
    return SystemMonitoringService.getDatabaseMetrics();
  },

  async isInspectionManualCreateEnabled(): Promise<boolean> {
    const value = await this.getSettingValue(
      'INSPECTION_MANUAL_CREATE_ENABLED',
    );
    return value === 'true' || value === null;
  },
};
