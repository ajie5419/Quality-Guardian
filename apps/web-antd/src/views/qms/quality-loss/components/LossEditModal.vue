<script lang="ts" setup>
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
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';

import {
  LOSS_TYPE_OPTIONS,
  SOURCE_STYLE_MAP,
  STATUS_OPTIONS,
} from '../constants';
import { LossSource } from '../types';

const props = defineProps<{
  deptTreeData: TreeSelectNode[];
  initialData: Partial<QmsQualityLossApi.QualityLossItem>;
  isEditMode: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { invalidateQualityLoss } = useInvalidateQmsQueries();

const formRef = ref();
const formState = reactive<Partial<QmsQualityLossApi.QualityLossItem>>({});
const confirmLoading = ref(false);

const rules: Record<string, Rule[]> = {
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  type: [{ required: true, message: '请选择损失类型', trigger: 'change' }],
  amount: [
    {
      required: true,
      validator: (_: any, val: number | undefined) =>
        val !== undefined && val >= 0
          ? Promise.resolve()
          : Promise.reject(new Error('金额不能为负数')),
      trigger: 'blur',
    },
  ],
  responsibleDepartment: [
    { required: true, message: '请选择责任部门', trigger: 'change' },
  ],
};

// 监听数据初始化
watch(
  () => props.open,
  (val) => {
    if (val) {
      // 清除旧数据并合并新数据
      Object.keys(formState).forEach((key) => {
        (formState as any)[key] = undefined;
      });
      Object.assign(formState, props.initialData);
    }
  },
);

/**
 * 提交表单
 */
async function handleOk() {
  try {
    await formRef.value.validate();
    confirmLoading.value = true;
    await (props.isEditMode && formState.id
      ? updateQualityLoss(formState.id, formState)
      : createQualityLoss(formState));
    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
    invalidateQualityLoss();
  } catch (error: any) {
    if (error?.errorFields) {
      console.warn('Validation failed:', error);
      return;
    }
    message.error(error.message || t('common.saveFailed'));
  } finally {
    confirmLoading.value = false;
  }
}

const isManualSource = computed(
  () => formState.lossSource === LossSource.MANUAL || !formState.lossSource,
);
</script>

<template>
  <Modal
    :open="open"
    :title="isEditMode ? '编辑损失记录' : '新增损失录入'"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    width="640px"
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
        :description="`当前记录源自${t(SOURCE_STYLE_MAP[formState.lossSource as LossSource]?.labelKey || '')}，仅支持更新索赔金额与状态。`"
        type="info"
        show-icon
        class="mb-4"
      />

      <Row :gutter="16">
        <Col :span="12">
          <FormItem label="日期" name="date" required>
            <Input
              v-model:value="formState.date as any"
              type="date"
              class="w-full"
              :disabled="!isManualSource"
            />
          </FormItem>
        </Col>
        <Col :span="12">
          <FormItem label="损失类型" name="type" required>
            <Select
              v-model:value="formState.type"
              :options="LOSS_TYPE_OPTIONS"
              :disabled="!isManualSource"
            />
          </FormItem>
        </Col>
      </Row>

      <Row :gutter="16">
        <Col :span="12">
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
        <Col :span="12">
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

      <FormItem label="责任部门" name="responsibleDepartment" required>
        <TreeSelect
          v-model:value="formState.responsibleDepartment"
          :tree-data="deptTreeData"
          placeholder="请选择责任部门"
          tree-default-expand-all
          :disabled="!isManualSource"
        />
      </FormItem>

      <FormItem label="当前状态" name="status">
        <Select
          v-model:value="formState.status"
          :options="
            STATUS_OPTIONS.map((opt) => ({
              value: opt.value,
              label: t(opt.label),
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
