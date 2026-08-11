<script lang="ts" setup>
import type {
  InspectionIssueResponsibilityType,
  InspectionRequestCheckResult,
  InspectionRequestResponsibilityDepartmentOption,
  InspectionRequestResponsibilitySupplierOption,
  InspectionRequestTeamOption,
} from '@qgs/shared';
import type {
  SelectProps,
  UploadChangeParam,
  UploadFile,
} from 'ant-design-vue';

import { computed } from 'vue';

import { Form, Input, InputNumber, Select } from 'ant-design-vue';

import { getInspectionRequestResponsibilityUnitCopy } from '../entry-mode';
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

type StationSelection = {
  indexes: number[];
  mode: 'ALL' | 'PARTIAL';
};

const props = defineProps<{
  beforeUpload: (file: File) => Promise<File>;
  bomPartOptions: Array<{ label: string; partName: string; value: string }>;
  bomPartsLoading: boolean;
  checkResultOptions: Array<{ label: string; value: string }>;
  entryCopy: EntryCopy;
  internalTeamOptions: InspectionRequestTeamOption[];
  isIncomingEntry: boolean;
  partSearchLoading: boolean;
  processOptions: Array<{
    label: string;
    processName: string;
    value: string;
  }>;
  requiresComponentName: boolean;
  requiresStationSelection: boolean;
  responsibilityDepartmentOptions: InspectionRequestResponsibilityDepartmentOption[];
  responsibilityLoading: boolean;
  responsibilityTypeOptions: Array<{
    label: string;
    value: InspectionIssueResponsibilityType;
  }>;
  stationQuantity: number;
  submitting: boolean;
  supplierOptions: InspectionRequestResponsibilitySupplierOption[];
  uploadAction: string;
  workOrderLoading: boolean;
  workOrderOptions: Array<{
    division?: null | string;
    label: string;
    multiStationEnabled?: boolean;
    quantity?: number;
    value: string;
  }>;
  workOrderProcessesLoading: boolean;
}>();

const emit = defineEmits<{
  attachmentChange: [info: UploadChangeParam<UploadFile>];
  partSearch: [keyword: string];
  responsibilityOptionsSearch: [keyword: string];
  responsibilityTypeChange: [value: InspectionIssueResponsibilityType];
  workOrderSearch: [keyword: string];
}>();

const form = defineModel<{
  componentName: string;
  incomingType: string;
  mutualCheckResult: InspectionRequestCheckResult;
  partId: string;
  partName: string;
  processId: string;
  processName: string;
  quantity: number;
  reporter: string;
  requestedPartName: string;
  requestInfo: string;
  requestNewPart: boolean;
  responsibilityType: InspectionIssueResponsibilityType;
  responsibleDepartmentId: string;
  selfCheckResult: InspectionRequestCheckResult;
  stationSelection: null | StationSelection;
  supplierId: string;
  team: string;
  teamId: string;
  workOrderNumber: string;
  workOrderNumbers: string[];
}>('form', { required: true });
const attachmentFileList = defineModel<UploadFile[]>('attachmentFileList', {
  required: true,
});

// Incoming type options follow the inspection request process settings
// (system/inspection-processes). Values are bound to the stable process ID so
// renaming a process does not break downstream identity resolution.
const incomingTypeOptions = computed(() =>
  props.processOptions.map((item) => ({
    label: item.processName,
    value: item.value,
  })),
);

const responsibilityUnitCopy = computed(() =>
  getInspectionRequestResponsibilityUnitCopy(form.value.responsibilityType),
);

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

function handleStationChange(value: SelectProps['value']) {
  const values = Array.isArray(value) ? value.map(String) : [];
  if (values.includes('ALL')) {
    form.value.stationSelection = { indexes: [], mode: 'ALL' };
    return;
  }
  const indexes = values
    .map(Number)
    .filter((item) => Number.isFinite(item) && item >= 1)
    .sort((a, b) => a - b);
  form.value.stationSelection =
    indexes.length > 0 ? { indexes, mode: 'PARTIAL' } : null;
}

function resolveStationValue() {
  if (!form.value.stationSelection) return [];
  if (form.value.stationSelection.mode === 'ALL') return ['ALL'];
  return form.value.stationSelection.indexes.map(String);
}

function handleResponsibilityTypeChange(value: SelectProps['value']) {
  if (
    value !== 'INTERNAL_DEPARTMENT' &&
    value !== 'SUPPLIER' &&
    value !== 'OUTSOURCING_UNIT'
  ) {
    return;
  }
  emit('responsibilityTypeChange', value);
}

function handleInternalTeamChange(value: SelectProps['value']) {
  const teamId = typeof value === 'string' ? value : '';
  const team = props.internalTeamOptions.find((item) => item.value === teamId);
  form.value.teamId = teamId;
  form.value.responsibleDepartmentId = team?.responsibleDepartmentId || '';
  form.value.supplierId = '';
}

function handleSupplierChange(value: SelectProps['value']) {
  form.value.supplierId = typeof value === 'string' ? value : '';
  form.value.team = '';
  form.value.teamId = '';
}

function handlePartIdentityChange(
  value: SelectProps['value'],
  option: unknown,
) {
  form.value.partId = typeof value === 'string' ? value : '';
  form.value.partName =
    option && typeof option === 'object' && 'partName' in option
      ? String((option as { partName?: unknown }).partName || '').trim()
      : '';
  if (form.value.partId) {
    form.value.requestedPartName = '';
    form.value.requestNewPart = false;
  }
}

function handleProcessIdentityChange(
  value: SelectProps['value'],
  option: unknown,
) {
  form.value.processId = typeof value === 'string' ? value : '';
  form.value.processName =
    option && typeof option === 'object' && 'processName' in option
      ? String((option as { processName?: unknown }).processName || '').trim()
      : '';
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
      :class="{
        'inspection-entry-work-order-multiple': props.isIncomingEntry,
      }"
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
      :value="form.processId"
      :options="props.processOptions"
      :loading="props.workOrderProcessesLoading"
      class="w-full"
      placeholder="请选择工序"
      show-search
      allow-clear
      @change="handleProcessIdentityChange"
    />
  </Form.Item>
  <Form.Item v-if="props.isIncomingEntry" label="进货类型" required>
    <Select
      v-model:value="form.incomingType"
      :options="incomingTypeOptions"
      class="w-full"
      placeholder="请选择进货类型"
      allow-clear
    />
  </Form.Item>
  <Form.Item :label="props.entryCopy.partLabel" required>
    <template v-if="props.isIncomingEntry && form.requestNewPart">
      <Input
        v-model:value="form.requestedPartName"
        class="w-full"
        :maxlength="100"
        placeholder="请输入申请物料名称"
        allow-clear
      />
    </template>
    <template v-else>
      <Select
        :value="form.partId"
        :filter-option="props.isIncomingEntry ? false : undefined"
        :options="props.bomPartOptions"
        :loading="props.bomPartsLoading || props.partSearchLoading"
        :disabled="!props.isIncomingEntry && !form.workOrderNumber"
        class="w-full"
        :placeholder="props.entryCopy.partPlaceholder"
        show-search
        allow-clear
        @change="handlePartIdentityChange"
        @search="
          (value) => {
            if (props.isIncomingEntry) emit('partSearch', value);
          }
        "
      />
      <div v-if="props.isIncomingEntry" class="mt-1">
        <span class="text-xs text-gray-500">
          优先推荐 BOM 物料，也可搜索全部已启用物料。
        </span>
      </div>
    </template>
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
    <Form.Item v-if="props.requiresStationSelection" label="台数" required>
      <Select
        :value="resolveStationValue()"
        :options="[
          { label: '全部台数', value: 'ALL' },
          ...Array.from({ length: props.stationQuantity || 0 }, (_, index) => ({
            label: `第 ${index + 1} 台`,
            value: String(index + 1),
          })),
        ]"
        class="inspection-entry-station-multiple w-full"
        mode="multiple"
        max-tag-count="responsive"
        placeholder="请选择第几台或全部台数"
        allow-clear
        @change="handleStationChange"
      />
    </Form.Item>
    <Form.Item v-if="!props.isIncomingEntry" label="责任归属类型" required>
      <Select
        :value="form.responsibilityType"
        :options="props.responsibilityTypeOptions"
        class="w-full"
        @change="handleResponsibilityTypeChange"
      />
    </Form.Item>
    <Form.Item v-else label="责任归属类型">
      <Input value="供应商" class="w-full" readonly />
    </Form.Item>
    <Form.Item
      v-if="form.responsibilityType === 'INTERNAL_DEPARTMENT'"
      label="责任班组"
      required
    >
      <Select
        data-testid="responsible-team-select"
        :value="form.teamId"
        :filter-option="false"
        :loading="props.responsibilityLoading"
        :options="props.internalTeamOptions"
        class="w-full"
        placeholder="请选择可解析责任部门的班组"
        show-search
        allow-clear
        @change="handleInternalTeamChange"
        @search="(value) => emit('responsibilityOptionsSearch', value)"
      />
    </Form.Item>
    <Form.Item v-else label="责任部门" required>
      <Input
        :value="
          props.responsibilityDepartmentOptions.find(
            (item) => item.value === form.responsibleDepartmentId,
          )?.label || '责任部门策略加载中'
        "
        class="w-full"
        readonly
      />
    </Form.Item>
    <Form.Item
      v-if="form.responsibilityType !== 'INTERNAL_DEPARTMENT'"
      :label="responsibilityUnitCopy.label"
      required
    >
      <Select
        data-testid="responsible-supplier-select"
        :value="form.supplierId"
        :filter-option="false"
        :loading="props.responsibilityLoading"
        :options="props.supplierOptions"
        class="w-full"
        :placeholder="responsibilityUnitCopy.placeholder"
        show-search
        allow-clear
        @change="handleSupplierChange"
        @search="(value) => emit('responsibilityOptionsSearch', value)"
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
