<script lang="ts" setup>
import type { BomItem, WorkOrderItem } from '@qgs/shared';
import type { Rule } from 'ant-design-vue/es/form';

import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { TreeSelectNode } from '#/types';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Alert,
  Col,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
  TreeSelect,
} from 'ant-design-vue';

import { createQualityLoss, updateQualityLoss } from '#/api/qms/quality-loss';
import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import BomItemSelect from '#/views/qms/shared/components/BomItemSelect.vue';
import WorkOrderSelect from '#/views/qms/shared/components/WorkOrderSelect.vue';

import {
  mapDictionaryOptionsToLossType,
  mapDictionaryOptionsToQualityLossStatus,
  SOURCE_STYLE_MAP,
} from '../constants';
import { LossSource } from '../types';

const props = defineProps<{
  deptTreeData: TreeSelectNode[];
  initialData: Partial<QmsQualityLossApi.QualityLossItem>;
  isEditMode: boolean;
  open: boolean;
  statusOptions?: Array<{ color?: string; label: string; value: string }>;
  typeOptions?: Array<{ label: string; value: string }>;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { invalidateQualityLoss } = useInvalidateQmsQueries();
const { handleApiError } = useErrorHandler();
const { isMobile, modalWidth, modalWrapClassName } = useAdaptivePopup();

const formRef = ref<{ validate: () => Promise<void> }>();
const formState = reactive<Partial<QmsQualityLossApi.QualityLossItem>>({});
const confirmLoading = ref(false);

const isValidationError = (
  error: unknown,
): error is { errorFields?: unknown[] } =>
  typeof error === 'object' &&
  error !== null &&
  'errorFields' in error &&
  Array.isArray((error as { errorFields?: unknown[] }).errorFields);

const hasResponsePayload = (error: unknown) =>
  typeof error === 'object' && error !== null && 'response' in error;

const rules: Record<string, Rule[]> = {
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  type: [{ required: true, message: '请选择损失类型', trigger: 'change' }],
  amount: [
    {
      required: true,
      validator: (_rule: unknown, val: number | undefined) =>
        val !== undefined && val >= 0
          ? Promise.resolve()
          : Promise.reject(new Error('金额不能为负数')),
      trigger: 'blur',
    },
  ],
  responsibleDepartmentId: [
    {
      validator: (_rule: unknown, value: null | string | undefined) =>
        String(value ?? '').trim() ||
        (props.isEditMode && props.initialData.responsibleDepartment)
          ? Promise.resolve()
          : Promise.reject(new Error('请选择责任部门')),
      trigger: 'change',
    },
  ],
  workOrderNumber: [
    {
      validator: (_rule: unknown, value: null | string | undefined) =>
        !isManualSource.value || String(value ?? '').trim()
          ? Promise.resolve()
          : Promise.reject(new Error('请选择工单')),
      trigger: 'change',
    },
  ],
  partName: [
    {
      validator: (_rule: unknown, value: null | string | undefined) =>
        !isManualSource.value || String(value ?? '').trim()
          ? Promise.resolve()
          : Promise.reject(new Error('请选择部件')),
      trigger: 'change',
    },
  ],
  projectName: [
    {
      validator: (_rule: unknown, value: null | string | undefined) =>
        !isManualSource.value || String(value ?? '').trim()
          ? Promise.resolve()
          : Promise.reject(new Error('所选工单未配置项目名称')),
      trigger: 'change',
    },
  ],
};

// 监听数据初始化
watch(
  () => props.open,
  (val) => {
    if (val) {
      // 清除旧数据并合并新数据
      for (const key of Object.keys(formState) as Array<
        keyof typeof formState
      >) {
        delete formState[key];
      }
      Object.assign(formState, props.initialData);
    }
  },
);

/**
 * 提交表单
 */
async function handleOk() {
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;
    const payload = { ...formState };
    if (!isManualSource.value) {
      delete payload.status;
    }
    await (props.isEditMode && formState.id
      ? updateQualityLoss(formState.id, payload)
      : createQualityLoss(payload));
    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
    invalidateQualityLoss();
  } catch (error: unknown) {
    if (isValidationError(error)) {
      console.warn('Validation failed:', error);
      return;
    }
    handleApiError(error, 'Save Quality Loss');

    // Fallback for non-HTTP or unexpected exceptions.
    if (!hasResponsePayload(error)) {
      message.error(t('common.saveFailed'));
    }
  } finally {
    confirmLoading.value = false;
  }
}

const isManualSource = computed(
  () => formState.lossSource === LossSource.MANUAL || !formState.lossSource,
);
const dateValue = computed<string | undefined>({
  get: () => formState.date ?? undefined,
  set: (value) => {
    formState.date = value ?? null;
  },
});
const responsibleDepartmentValue = computed<string | undefined>({
  get: () => formState.responsibleDepartmentId ?? undefined,
  set: (value) => {
    formState.responsibleDepartmentId = value ?? null;
  },
});

function handleWorkOrderChange(
  value: null | string | undefined,
  option?: { item?: WorkOrderItem },
) {
  formState.workOrderNumber = value || null;
  formState.projectName = option?.item?.projectName || null;
  formState.projectId = null;
  formState.partName = null;
  formState.partId = null;
}

function handlePartChange(value: unknown, option?: unknown) {
  const selectedOption =
    option && !Array.isArray(option) && typeof option === 'object'
      ? (option as { item?: BomItem })
      : undefined;
  formState.partName = String(value ?? '').trim() || null;
  formState.partId = selectedOption?.item?.partId || null;
}

function handlePartModelUpdate(value: unknown) {
  formState.partName = String(value ?? '').trim() || null;
}
</script>

<template>
  <Modal
    :open="open"
    :title="isEditMode ? '编辑损失记录' : '新增损失录入'"
    :width="isMobile ? modalWidth : '640px'"
    :wrap-class-name="modalWrapClassName"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    destroy-on-close
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-4"
    >
      <!-- 来源提示 -->
      <Alert
        v-if="!isManualSource"
        message="提示"
        :description="`当前记录源自${t(SOURCE_STYLE_MAP[formState.lossSource as LossSource]?.labelKey || '')}，仅支持更新索赔金额。状态请回到对应业务页面修改。`"
        type="info"
        show-icon
        class="mb-4"
      />

      <Row :gutter="16">
        <Col :span="isMobile ? 24 : 12">
          <FormItem
            label="工单号"
            name="workOrderNumber"
            :required="isManualSource"
          >
            <WorkOrderSelect
              :value="formState.workOrderNumber"
              :disabled="!isManualSource"
              @update:value="formState.workOrderNumber = $event || null"
              @change="handleWorkOrderChange"
            />
          </FormItem>
        </Col>
        <Col :span="isMobile ? 24 : 12">
          <FormItem
            label="项目名称"
            name="projectName"
            :required="isManualSource"
          >
            <Input
              :value="formState.projectName || ''"
              placeholder="选择工单后自动带出"
              readonly
            />
          </FormItem>
        </Col>
      </Row>

      <FormItem label="部件名称" name="partName" :required="isManualSource">
        <BomItemSelect
          :value="formState.partName"
          :work-order-number="formState.workOrderNumber"
          :disabled="!isManualSource || !formState.workOrderNumber"
          @update:value="handlePartModelUpdate"
          @change="handlePartChange"
        />
      </FormItem>

      <Row :gutter="16">
        <Col :span="isMobile ? 24 : 12">
          <FormItem label="日期" name="date" required>
            <Input
              v-model:value="dateValue"
              type="date"
              class="w-full"
              :disabled="!isManualSource"
            />
          </FormItem>
        </Col>
        <Col :span="isMobile ? 24 : 12">
          <FormItem label="损失类型" name="type" required>
            <Select
              v-model:value="formState.type"
              :options="props.typeOptions || mapDictionaryOptionsToLossType()"
              :disabled="!isManualSource"
            />
          </FormItem>
        </Col>
      </Row>

      <Row :gutter="16">
        <Col :span="isMobile ? 24 : 12">
          <FormItem label="预计损失金额 (¥)" name="amount" required>
            <InputNumber
              v-model:value="formState.amount"
              class="w-full"
              :min="0"
              :precision="2"
              :disabled="!isManualSource"
            />
          </FormItem>
        </Col>
        <Col :span="isMobile ? 24 : 12">
          <FormItem label="实际索赔金额 (¥)" name="actualClaim">
            <InputNumber
              v-model:value="formState.actualClaim"
              class="w-full"
              :min="0"
              :precision="2"
            />
          </FormItem>
        </Col>
      </Row>

      <FormItem label="责任部门" name="responsibleDepartmentId" required>
        <TreeSelect
          v-model:value="responsibleDepartmentValue"
          :tree-data="deptTreeData"
          placeholder="请选择责任部门"
          tree-default-expand-all
          :disabled="!isManualSource"
        />
      </FormItem>

      <FormItem label="当前状态" name="status">
        <Select
          v-model:value="formState.status"
          :disabled="!isManualSource"
          :options="
            (
              props.statusOptions || mapDictionaryOptionsToQualityLossStatus()
            ).map((opt) => ({
              value: opt.value,
              label:
                typeof opt.label === 'string' && opt.label.includes('.')
                  ? t(opt.label)
                  : opt.label,
            }))
          "
        />
      </FormItem>

      <FormItem label="情况说明" name="description">
        <Input.TextArea
          v-model:value="formState.description"
          :rows="3"
          placeholder="请输入详细的质量损失情况说明..."
        />
      </FormItem>
    </Form>
  </Modal>
</template>
