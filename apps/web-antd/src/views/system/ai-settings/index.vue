<script lang="ts" setup>
import type { SystemAiApi } from '#/api/system/ai-settings';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  FormItem,
  Input,
  message,
  Select,
  Space,
} from 'ant-design-vue';

import {
  getAiSetting,
  testAiConnection,
  updateAiSetting,
} from '#/api/system/ai-settings';

const { t } = useI18n();
const loading = ref(false);
const testing = ref(false);

const formState = reactive<SystemAiApi.AiSetting>({
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
      availableModels: ['gpt-4o', 'gpt-4o-mini'],
    },
  },
});

const providerOptions = [
  { label: 'DeepSeek', value: 'deepseek' },
  { label: '智谱 GLM', value: 'zhipu' },
  { label: 'OpenAI 兼容', value: 'openai' },
];

// 当前供应商的配置（计算属性，方便绑定）
const activeConfig = computed(() => {
  return formState.configs[formState.provider];
});

async function loadSettings() {
  loading.value = true;
  try {
    const data = await getAiSetting();
    // 深度合并
    formState.provider = data.provider;
    if (data.configs) {
      Object.assign(formState.configs, data.configs);
    }
  } catch {
    message.error(t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  loading.value = true;
  try {
    await updateAiSetting(formState);
    message.success(t('common.saveSuccess'));
  } catch {
    message.error(t('common.saveFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleTest() {
  testing.value = true;
  try {
    // 发送当前活动的配置进行测试
    await testAiConnection({
      provider: formState.provider,
      apiKey: activeConfig.value.apiKey,
      baseUrl: activeConfig.value.baseUrl,
      model: activeConfig.value.model,
    });
    message.success(t('common.testSuccess'));
  } catch (error: unknown) {
    const axiosError = error as { message?: string };
    message.error(axiosError.message || t('common.testFailed'));
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  loadSettings();
});
</script>

<template>
  <Page>
    <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <Alert
        :message="t('sys.aiSettings.configDesc')"
        :description="t('sys.aiSettings.configHelp')"
        type="info"
        show-icon
        class="mb-4"
      />

      <Card :title="t('sys.aiSettings.providerSettings')" :loading="loading">
        <Form layout="vertical">
          <FormItem :label="t('sys.aiSettings.currentProvider')" required>
            <Select
              v-model:value="formState.provider"
              :options="providerOptions"
            />
          </FormItem>

          <Divider orientation="left">
            {{
              t('sys.aiSettings.detailConfig', {
                provider: formState.provider.toUpperCase(),
              })
            }}
          </Divider>

          <FormItem
            :label="t('sys.aiSettings.apiKey')"
            required
            :tooltip="t('sys.aiSettings.apiKeyTooltip')"
          >
            <Input.Password
              v-model:value="activeConfig.apiKey"
              :placeholder="`${t('common.pleaseInput')} ${t('sys.aiSettings.apiKey')}`"
            />
          </FormItem>

          <FormItem :label="t('sys.aiSettings.baseUrl')" required>
            <Input
              v-model:value="activeConfig.baseUrl"
              placeholder="https://api.example.com/v1"
            />
          </FormItem>

          <FormItem :label="t('sys.aiSettings.defaultModel')" required>
            <Select
              v-model:value="activeConfig.model"
              :placeholder="t('common.pleaseSelect')"
              show-search
            >
              <Select.Option
                v-for="m in activeConfig.availableModels"
                :key="m"
                :value="m"
              >
                {{ m }}
              </Select.Option>
            </Select>
          </FormItem>

          <FormItem :label="t('sys.aiSettings.availableModels')">
            <Input.TextArea
              :value="activeConfig.availableModels.join(',')"
              @change="
                (e: Event) => {
                  const target = e.target as HTMLTextAreaElement;
                  activeConfig.availableModels = target.value
                    .split(',')
                    .filter(Boolean)
                    .map((s) => s.trim());
                }
              "
              placeholder="例如: gpt-4o, gpt-4o-mini"
              :rows="2"
            />
          </FormItem>

          <FormItem class="mb-0 mt-6">
            <Space>
              <Button type="primary" :loading="loading" @click="handleSave">
                {{ t('sys.aiSettings.saveConfig') }}
              </Button>
              <Button :loading="testing" @click="handleTest">
                {{ t('sys.aiSettings.testConnection') }}
              </Button>
            </Space>
          </FormItem>
        </Form>
      </Card>

      <Card :title="t('sys.aiSettings.commonUrlRef')" class="mt-4">
        <div class="space-y-2 text-sm text-gray-500">
          <p><b>• DeepSeek</b>: <code>https://api.deepseek.com</code></p>
          <p>
            <b>• 智谱 GLM</b>:
            <code>https://open.bigmodel.cn/api/paas/v4/</code>
          </p>
          <p><b>• OpenAI</b>: <code>https://api.openai.com/v1</code></p>
        </div>
      </Card>
    </div>
  </Page>
</template>
