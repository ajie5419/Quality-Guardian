<script lang="ts" setup>
import type {
  SelectProps,
  UploadChangeParam,
  UploadFile,
} from 'ant-design-vue';

import type { InspectionRequestCheckResult } from '#/api/qms/inspection-request';

import { Form, Input, InputNumber, Select } from 'ant-design-vue';

import { incomingInspectionTypeOptions } from '../entry-mode';
import InspectionRequestEntryUploadActions from './InspectionRequestEntryUploadActions.vue';

type EntryCopy = {
  attachmentLabel: string;
  componentLabel: string;
  partLabel: string;
  partPlaceholder: string;
  processLabel: string;
  teamLabel: string;
  teamPlaceholder: string;
};

const props = defineProps<{
  beforeUpload: (file: File) => Promise<File>;
  bomPartOptions: Array<{ label: string; value: string }>;
  bomPartsLoading: boolean;
  checkResultOptions: Array<{ label: string; value: string }>;
  entryCopy: EntryCopy;
  isIncomingEntry: boolean;
  processOptions: Array<{ label: string; value: string }>;
  requiresComponentName: boolean;
  submitting: boolean;
  teamLoading: boolean;
  teamOptions: SelectProps['options'];
  uploadAction: string;
  workOrderLoading: boolean;
  workOrderOptions: Array<{ label: string; value: string }>;
  workOrderProcessesLoading: boolean;
}>();

const emit = defineEmits<{
  attachmentChange: [info: UploadChangeParam<UploadFile>];
  responsibleUnitSearch: [keyword: string];
  workOrderSearch: [keyword: string];
}>();

const form = defineModel<{
  componentName: string;
  incomingType: string;
  mutualCheckResult: InspectionRequestCheckResult;
  partName: string;
  processName: string;
  quantity: number;
  reporter: string;
  requestInfo: string;
  selfCheckResult: InspectionRequestCheckResult;
  team: string;
  workOrderNumber: string;
  workOrderNumbers: string[];
}>('form', { required: true });
const attachmentFileList = defineModel<UploadFile[]>('attachmentFileList', {
  required: true,
});

function handleWorkOrderChange(value: SelectProps['value']) {
  if (props.isIncomingEntry) {
    const values = Array.isArray(value) ? value.map(String) : [];
    form.value.workOrderNumbers = values;
    form.value.workOrderNumber = values[0] || '';
    return;
  }
  const nextValue = typeof value === 'string' ? value : '';
  form.value.workOrderNumber = nextValue;
  form.value.workOrderNumbers = nextValue ? [nextValue] : [];
}
</script>

<template>
  <Form.Item label="工单号" required>
    <Select
      :value="
        props.isIncomingEntry ? form.workOrderNumbers : form.workOrderNumber
      "
      :filter-option="false"
      :loading="props.workOrderLoading"
      :mode="props.isIncomingEntry ? 'multiple' : undefined"
      :options="props.workOrderOptions"
      class="w-full"
      :placeholder="
        props.isIncomingEntry
          ? '请选择或搜索工单号，可多选'
          : '请选择或搜索工单号'
      "
      max-tag-count="responsive"
      show-search
      allow-clear
      @change="handleWorkOrderChange"
      @search="(value) => emit('workOrderSearch', value)"
    />
  </Form.Item>
  <Form.Item
    v-if="!props.isIncomingEntry"
    :label="props.entryCopy.processLabel"
    required
  >
    <Select
      v-model:value="form.processName"
      :options="props.processOptions"
      :loading="props.workOrderProcessesLoading"
      class="w-full"
      placeholder="请选择工序"
      show-search
      allow-clear
    />
  </Form.Item>
  <Form.Item v-if="props.isIncomingEntry" label="进货类型" required>
    <Select
      v-model:value="form.incomingType"
      :options="incomingInspectionTypeOptions"
      class="w-full"
      placeholder="请选择进货类型"
      allow-clear
    />
  </Form.Item>
  <Form.Item :label="props.entryCopy.partLabel" required>
    <Input
      v-if="props.isIncomingEntry"
      v-model:value="form.partName"
      class="w-full"
      :placeholder="props.entryCopy.partPlaceholder"
      allow-clear
    />
    <Select
      v-else
      v-model:value="form.partName"
      :options="props.bomPartOptions"
      :loading="props.bomPartsLoading"
      :disabled="!form.workOrderNumber"
      class="w-full"
      :placeholder="props.entryCopy.partPlaceholder"
      show-search
      allow-clear
    />
  </Form.Item>
  <Form.Item
    v-if="props.requiresComponentName"
    :label="props.entryCopy.componentLabel"
    required
  >
    <Input
      v-model:value="form.componentName"
      class="w-full"
      placeholder="请输入组件名称"
      allow-clear
    />
  </Form.Item>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Form.Item label="数量" required>
      <InputNumber
        v-model:value="form.quantity"
        :min="1"
        :precision="0"
        class="w-full min-w-0"
      />
    </Form.Item>
    <Form.Item :label="props.entryCopy.teamLabel" required>
      <Select
        v-model:value="form.team"
        :filter-option="false"
        :loading="props.teamLoading"
        :options="props.teamOptions"
        class="w-full"
        :placeholder="props.entryCopy.teamPlaceholder"
        show-search
        allow-clear
        @search="(value) => emit('responsibleUnitSearch', value)"
      />
    </Form.Item>
  </div>
  <Form.Item label="报检人" required>
    <Input
      v-model:value="form.reporter"
      class="w-full"
      placeholder="请输入报检人"
      allow-clear
    />
  </Form.Item>
  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <Form.Item label="自检结果">
      <Select
        v-model:value="form.selfCheckResult"
        :options="props.checkResultOptions"
        class="w-full"
      />
    </Form.Item>
    <Form.Item label="互检结果">
      <Select
        v-model:value="form.mutualCheckResult"
        :options="props.checkResultOptions"
        class="w-full"
      />
    </Form.Item>
  </div>
  <Form.Item label="报检信息">
    <Input.TextArea
      v-model:value="form.requestInfo"
      :rows="4"
      class="w-full"
      placeholder="请输入补充说明"
    />
  </Form.Item>
  <Form.Item :label="props.entryCopy.attachmentLabel" required>
    <InspectionRequestEntryUploadActions
      v-model:file-list="attachmentFileList"
      :action="props.uploadAction"
      :before-upload="props.beforeUpload"
      :disabled="props.submitting"
      @change="(info) => emit('attachmentChange', info)"
    />
  </Form.Item>
</template>
