<script lang="ts" setup>
import type { Rule } from 'ant-design-vue/es/form';

import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
} from 'ant-design-vue';

import {
  createMetrologyMutation,
  updateMetrologyMutation,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { getEditStatusOptions } from '../data';

const props = defineProps<{
  open: boolean;
  record: null | QmsMetrologyApi.MetrologyItem;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const confirmLoading = ref(false);
const formRef = ref();

interface MetrologyFormState {
  inspectionStatus: QmsMetrologyApi.MetrologyInspectionStatus;
  instrumentCode: string;
  instrumentName: string;
  model: string;
  orderNo?: number;
  usingUnit: string;
  validUntil: string;
}

const formState = reactive<MetrologyFormState>({
  inspectionStatus: 'VALID',
  instrumentCode: '',
  instrumentName: '',
  model: '',
  orderNo: undefined,
  usingUnit: '',
  validUntil: '',
});

const rules: Record<string, Rule[]> = {
  instrumentCode: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
  instrumentName: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
};

const isEditMode = ref(false);

watch(
  () => props.open,
  (value) => {
    if (value) {
      isEditMode.value = Boolean(props.record?.id);
      Object.assign(formState, {
        inspectionStatus: props.record?.inspectionStatus || 'VALID',
        instrumentCode: props.record?.instrumentCode || '',
        instrumentName: props.record?.instrumentName || '',
        model: props.record?.model || '',
        orderNo: props.record?.orderNo ?? undefined,
        usingUnit: props.record?.usingUnit || '',
        validUntil: props.record?.validUntil || '',
      });
      return;
    }
    formRef.value?.resetFields();
  },
);

async function handleOk() {
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    const payload: QmsMetrologyApi.MetrologyMutationPayload = {
      inspectionStatus: formState.inspectionStatus,
      instrumentCode: String(formState.instrumentCode || '').trim(),
      instrumentName: String(formState.instrumentName || '').trim(),
      model: String(formState.model || '').trim() || null,
      orderNo: typeof formState.orderNo === 'number' ? formState.orderNo : null,
      usingUnit: String(formState.usingUnit || '').trim() || null,
      validUntil: formState.validUntil || null,
    };

    await (isEditMode.value && props.record?.id
      ? updateMetrologyMutation(props.record.id, payload)
      : createMetrologyMutation(payload));

    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'errorFields' in error) {
      return;
    }
    handleApiError(error, 'Save Metrology');
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="props.open"
    :title="
      isEditMode ? t('qms.metrology.editTitle') : t('qms.metrology.createTitle')
    "
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
      <div class="grid grid-cols-2 gap-4">
        <Form.Item :label="t('qms.metrology.orderNo')" name="orderNo">
          <InputNumber
            v-model:value="formState.orderNo"
            :min="0"
            class="w-full"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.instrumentName')"
          name="instrumentName"
        >
          <Input v-model:value="formState.instrumentName" />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.instrumentCode')"
          name="instrumentCode"
        >
          <Input v-model:value="formState.instrumentCode" />
        </Form.Item>

        <Form.Item :label="t('qms.metrology.model')" name="model">
          <Input v-model:value="formState.model" />
        </Form.Item>

        <Form.Item :label="t('qms.metrology.usingUnit')" name="usingUnit">
          <Input v-model:value="formState.usingUnit" />
        </Form.Item>

        <Form.Item :label="t('qms.metrology.validUntil')" name="validUntil">
          <Input
            v-model:value="formState.validUntil"
            placeholder="YYYY-MM-DD"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.inspectionStatus')"
          name="inspectionStatus"
        >
          <Select
            v-model:value="formState.inspectionStatus"
            :options="getEditStatusOptions()"
          />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
