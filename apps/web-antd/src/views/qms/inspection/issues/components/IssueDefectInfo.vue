<script lang="ts" setup>
import type { IssueFormState } from '../types';

import { ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Button, FormItem, Input, Select, Tag, Tooltip } from 'ant-design-vue';

import {
  useClaimOptions,
  useDefectOptions,
  useSeverityOptions,
  useStatusOptions,
} from '../constants';

defineProps<{
  isAiAnalyzing: boolean;
  isMatchingCases: boolean;
}>();

const emit = defineEmits<{
  aiAnalyze: [];
  matchHistory: [];
}>();

const formState = defineModel<IssueFormState>('formState', { required: true });

const { t } = useI18n();
const { defectOptions, defectSubtypes } = useDefectOptions();
const { statusOptions } = useStatusOptions();
const { severityOptions } = useSeverityOptions();
const { claimOptions } = useClaimOptions();

const currentSubtypeOptions = ref<{ label: string; value: string }[]>([]);

function updateSubtypes() {
  currentSubtypeOptions.value =
    formState.value.defectType &&
    defectSubtypes.value[formState.value.defectType]
      ? defectSubtypes.value[formState.value.defectType as string] || []
      : [];
}

function handleDefectTypeChange() {
  formState.value.defectSubtype = '';
  updateSubtypes();
}

// 初始化子类型选项
watch(
  () => formState.value.defectType,
  () => updateSubtypes(),
  { immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <!-- 状态选择 -->
    <FormItem :label="t('qms.inspection.issues.statusLabel')" name="status">
      <Select
        v-model:value="formState.status"
        :options="statusOptions"
        class="w-full"
      />
    </FormItem>

    <!-- 严重程度选择 -->
    <FormItem :label="t('qms.inspection.issues.severity')" name="severity">
      <Select
        v-model:value="formState.severity"
        :options="severityOptions"
        class="w-full"
      >
        <template #option="{ label, color }">
          <Tag :color="color">{{ label }}</Tag>
        </template>
      </Select>
    </FormItem>

    <!-- 缺陷分类 -->
    <div class="grid grid-cols-2 gap-2">
      <FormItem
        :label="t('qms.inspection.issues.defectType')"
        name="defectType"
      >
        <Select
          v-model:value="formState.defectType"
          :options="defectOptions"
          class="w-full"
          @change="handleDefectTypeChange"
        />
      </FormItem>
      <FormItem
        :label="t('qms.inspection.issues.defectSubtype')"
        name="defectSubtype"
      >
        <Select
          v-model:value="formState.defectSubtype"
          :options="currentSubtypeOptions"
          class="w-full"
        />
      </FormItem>
    </div>

    <!-- 损失金额 -->
    <FormItem :label="t('qms.inspection.issues.lossAmount')" name="lossAmount">
      <Input
        v-model:value="formState.lossAmount"
        class="w-full"
        type="number"
        step="0.01"
      />
    </FormItem>

    <!-- 是否索赔 -->
    <FormItem :label="t('qms.inspection.issues.claim')" name="claim">
      <Select
        v-model:value="formState.claim"
        :options="claimOptions"
        class="w-full"
      />
    </FormItem>

    <!-- 问题描述 -->
    <FormItem
      :label="t('qms.inspection.issues.description')"
      name="description"
    >
      <template #label>
        <div class="flex w-full items-center justify-between">
          <span>{{ t('qms.inspection.issues.description') }}</span>
          <div class="flex gap-2">
            <Tooltip :title="t('qms.inspection.issues.aiAnalyzeTooltip')">
              <Button
                :loading="isAiAnalyzing"
                size="small"
                type="link"
                @click="emit('aiAnalyze')"
              >
                <span class="i-lucide-sparkles mr-1"></span>
                {{ t('qms.inspection.issues.aiAnalyze') }}
              </Button>
            </Tooltip>
            <Tooltip :title="t('qms.inspection.issues.matchHistoryTooltip')">
              <Button
                :loading="isMatchingCases"
                size="small"
                type="link"
                @click="emit('matchHistory')"
              >
                <span class="i-lucide-history mr-1"></span>
                {{ t('qms.inspection.issues.matchCases') }}
              </Button>
            </Tooltip>
          </div>
        </div>
      </template>
      <Input.TextArea
        v-model:value="formState.description"
        :placeholder="t('qms.inspection.issues.descriptionPlaceholder')"
        :rows="3"
      />
    </FormItem>

    <!-- 根本原因 -->
    <FormItem :label="t('qms.inspection.issues.rootCause')">
      <Input.TextArea v-model:value="formState.rootCause" :rows="2" />
    </FormItem>

    <!-- 解决方案 -->
    <FormItem :label="t('qms.inspection.issues.solution')">
      <Input.TextArea v-model:value="formState.solution" :rows="2" />
    </FormItem>
  </div>
</template>
