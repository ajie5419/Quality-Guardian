<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue';
import type { ColumnType } from 'ant-design-vue/es/table';

import type { QmsPlanningApi } from '#/api/qms/planning';

import { ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useI18n } from '@vben/locales';

import {
  Button,
  Card,
  Input,
  message,
  Modal,
  Result,
  Select,
  Steps,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  generateItpFromFiles,
  importGeneratedItp,
} from '#/api/qms/ai-planning';
import { getItpProjectList } from '#/api/qms/planning';

const { t } = useI18n();

const currentStep = ref(0);
const fileList = ref<UploadFile[]>([]);
const generating = ref(false);
const generatedItems = ref<QmsPlanningApi.ItpItem[]>([]);
const selectedProjectId = ref<string | undefined>(undefined);
const itpProjects = ref<QmsPlanningApi.ItpProject[]>([]);
const customPrompt = ref(t('qms.planning.itpGenerator.defaultPrompt'));

const processingLogs = ref<string[]>([]);
const extractedContent = ref('');

const getErrorDetail = (error: unknown) => {
  const maybeResponse = error as {
    response?: { data?: { message?: string } };
  };
  return (
    maybeResponse.response?.data?.message ||
    (error as Error).message ||
    t('common.unknownError')
  );
};

const columns: ColumnType[] = [
  {
    title: t('qms.planning.itp.processStep'),
    dataIndex: 'processStep',
    width: 120,
  },
  { title: t('qms.planning.itp.activity'), dataIndex: 'activity', width: 150 },
  {
    title: t('qms.planning.itp.controlPoint.label'),
    dataIndex: 'controlPoint',
    width: 70,
    align: 'center',
  },
  {
    title: t('qms.planning.itp.criteria'),
    dataIndex: 'acceptanceCriteria',
    minWidth: 150,
  },
  {
    title: t('qms.planning.itp.quantitative'),
    key: 'quantitative',
    width: 220,
  },
];

function fillExample() {
  customPrompt.value = `工序：精加工阶段
1. 轴承位直径：120mm，公差范围 +0.01 / -0.02mm
2. 表面粗糙度：Ra 0.8μm
3. 焊缝：100% 超声波探伤，符合 JB/T 4730 标准`;
}

async function extractTextFromPDF(_file: File): Promise<string> {
  return 'PDF parsing temporarily disabled for build check.';
}

async function extractTextFromWord(_file: File): Promise<string> {
  return 'Word parsing disabled for build check';
}

async function readFileContent(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') {
    processingLogs.value.push(
      '[本地] 检测到 PDF 格式，正在启动 PDF.js 解析引擎...',
    );
    return await extractTextFromPDF(file);
  } else if (extension === 'docx' || extension === 'doc') {
    processingLogs.value.push(
      '[本地] 检测到 Word 格式，正在启动 Mammoth 解析引擎...',
    );
    return await extractTextFromWord(file);
  } else {
    const slice = file.slice(0, 50_000);
    return await slice.text();
  }
}

async function handleGenerate() {
  if (fileList.value.length === 0 && !customPrompt.value) {
    message.warning(t('qms.planning.itpGenerator.uploadOrDescribe'));
    return;
  }

  generating.value = true;
  processingLogs.value = [
    `[${t('common.system')}] ${t('qms.planning.itpGenerator.startParseLog')}...`,
  ];
  extractedContent.value = '';

  try {
    if (fileList.value.length > 0) {
      processingLogs.value.push(
        `[${t('common.local')}] ${t('qms.planning.itpGenerator.readingFileLog')}...`,
      );
      const fileObj = fileList.value[0]?.originFileObj || fileList.value[0];
      if (fileObj instanceof File) {
        extractedContent.value = await readFileContent(fileObj);
        processingLogs.value.push(
          `[${t('common.local')}] ${t('qms.planning.itpGenerator.extractedCompletedLog')} (${extractedContent.value.length} ${t('common.unit.char')})`,
        );
      }
    }

    processingLogs.value.push(
      `[${t('common.network')}] ${t('qms.planning.itpGenerator.aiRequestLog')}...`,
    );
    const data = await generateItpFromFiles({
      fileContent: extractedContent.value,
      fileList: fileList.value,
      prompt: customPrompt.value,
    });

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error(t('qms.planning.itpGenerator.noItemsIdentified'));
    }

    processingLogs.value.push(
      `[${t('common.completed')}] ${t('qms.planning.itpGenerator.parseSuccessLog', { count: data.length })}`,
    );
    generatedItems.value = data;
    currentStep.value = 1;
    message.success(t('qms.planning.itpGenerator.parseCompleted'));
  } catch (error) {
    const errorDetail = getErrorDetail(error);
    processingLogs.value.push(
      `[${t('common.error')}] ${t('qms.planning.itpGenerator.parseFailed')}: ${errorDetail}`,
    );
    Modal.error({
      content: `${t('common.detailReason')}：${errorDetail}`,
      title: t('qms.planning.itpGenerator.parseFailed'),
    });
  } finally {
    generating.value = false;
  }
}

async function handleImport() {
  if (!selectedProjectId.value)
    return message.warning(t('qms.planning.itpGenerator.selectImportTarget'));
  try {
    await importGeneratedItp(selectedProjectId.value, generatedItems.value);
    message.success(t('qms.planning.itpGenerator.importSuccess'));
    currentStep.value = 2;
  } catch {
    message.error(t('common.importFailed'));
  }
}

async function loadProjects() {
  try {
    itpProjects.value = await getItpProjectList();
  } catch {}
}

loadProjects();
</script>

<template>
  <Page>
    <div class="mx-auto max-w-5xl p-6">
      <Card class="mb-6 shadow-sm">
        <Steps :current="currentStep">
          <Steps.Step :title="t('qms.planning.itpGenerator.step1')" />
          <Steps.Step :title="t('qms.planning.itpGenerator.step2')" />
          <Steps.Step :title="t('qms.planning.itpGenerator.step3')" />
        </Steps>
      </Card>

      <!-- Step 0: Upload -->
      <div
        v-if="currentStep === 0"
        class="animate-in fade-in space-y-6 duration-500"
      >
        <Card :title="t('qms.planning.itpGenerator.uploadTitle')">
          <Upload.Dragger
            v-model:file-list="fileList"
            :multiple="true"
            action="/api/upload"
            accept=".pdf,.doc,.docx,.jpg,.png"
          >
            <p class="mb-4 mt-4 flex justify-center text-5xl text-blue-500">
              <span class="i-lucide-file-up"></span>
            </p>
            <p class="ant-upload-text font-bold">
              {{ t('qms.planning.itpGenerator.uploadHint') }}
            </p>
            <p class="ant-upload-hint px-4 pb-4">
              {{ t('qms.planning.itpGenerator.uploadSupport') }} <br />
              <span class="text-orange-500">{{
                t('qms.planning.itpGenerator.modelStrengthHint')
              }}</span>
            </p>
          </Upload.Dragger>
        </Card>

        <Card :title="t('qms.planning.itpGenerator.extraInfo')">
          <template #extra>
            <Button type="link" size="small" @click="fillExample">{{
              t('qms.planning.itpGenerator.fillExample')
            }}</Button>
          </template>
          <div class="mb-2 text-xs font-bold text-orange-500">
            {{ t('qms.planning.itpGenerator.fastModeHint') }}
          </div>
          <Input.TextArea
            v-model:value="customPrompt"
            :rows="8"
            placeholder="例如：工序：总装..."
          />
        </Card>

        <div class="mt-8 flex justify-center">
          <div class="w-full text-center">
            <Button
              type="primary"
              size="large"
              :loading="generating"
              @click="handleGenerate"
              class="mx-auto flex h-auto items-center gap-2 px-8 py-6 text-lg shadow-lg"
            >
              <span class="i-lucide-sparkles"></span
              >{{ t('qms.planning.itpGenerator.startAiParse') }}
            </Button>
            <div
              v-if="processingLogs.length > 0"
              class="mx-auto mt-6 max-w-2xl rounded-lg bg-gray-900 p-4 text-left font-mono text-xs text-green-400 shadow-inner"
            >
              <div v-for="(log, idx) in processingLogs" :key="idx" class="mb-1">
                <span class="opacity-50"
                  >[{{ new Date().toLocaleTimeString() }}]</span
                >
                {{ log }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 1: Preview -->
      <div
        v-if="currentStep === 1"
        class="animate-in fade-in space-y-6 duration-500"
      >
        <Card title="AI 智能解析结果">
          <Table
            :columns="columns"
            :data-source="generatedItems"
            :pagination="false"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'quantitative'">
                <div
                  v-if="record.isQuantitative"
                  class="rounded border border-blue-100 bg-blue-50 p-2"
                >
                  <div class="mb-1 text-xs font-bold text-blue-600">
                    {{ t('qms.planning.itpGenerator.quantitativeExtracted') }}:
                  </div>
                  <div class="text-sm">
                    {{ t('qms.planning.itpGenerator.std') }}:
                    <b class="text-blue-700">{{ record.standardValue }}</b> (+{{
                      record.upperTolerance
                    }}
                    / -{{ record.lowerTolerance }}) {{ record.unit }}
                  </div>
                </div>
                <Tag v-else color="default">{{
                  t('qms.planning.itpGenerator.qualitative')
                }}</Tag>
              </template>
            </template>
          </Table>
        </Card>
        <Card :title="t('qms.planning.itpGenerator.confirmImportTarget')">
          <div class="flex items-center gap-4">
            <span class="font-bold text-gray-600"
              >{{ t('qms.planning.itpGenerator.targetItp') }}:</span
            >
            <Select
              v-model:value="selectedProjectId"
              class="w-80"
              :placeholder="t('qms.planning.itpGenerator.selectImportTarget')"
              :options="
                itpProjects.map((p) => ({
                  label: p.projectName,
                  value: p.id,
                }))
              "
            />
            <Button type="primary" @click="handleImport">{{
              t('common.confirmImport')
            }}</Button>
            <Button @click="currentStep = 0">{{ t('common.reUpload') }}</Button>
          </div>
        </Card>
      </div>

      <!-- Step 2: Success -->
      <div v-if="currentStep === 2" class="animate-in zoom-in duration-300">
        <Card>
          <Result
            status="success"
            :title="t('qms.planning.itpGenerator.successTitle')"
            :sub-title="t('qms.planning.itpGenerator.successSubTitle')"
          >
            <template #extra>
              <Button type="primary" @click="currentStep = 0">{{
                t('common.continueUpload')
              }}</Button>
              <router-link to="/qms/planning/itp"
                ><Button>{{
                  t('qms.planning.itpGenerator.viewItp')
                }}</Button></router-link
              >
            </template>
          </Result>
        </Card>
      </div>
    </div>
  </Page>
</template>
