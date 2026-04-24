<script lang="ts" setup>
import type { Rule } from 'ant-design-vue/es/form';

import type { QmsMetrologyApi } from '#/api/qms/metrology';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
} from 'ant-design-vue';

import {
  createMetrologyCalibrationPlanMutation,
  updateMetrologyCalibrationPlanMutation,
} from '#/api/qms/metrology';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { getMonthOptions } from '../data';

const props = defineProps<{
  instrumentOptions: Array<{
    label: string;
    value: string;
  }>;
  open: boolean;
  record: null | QmsMetrologyApi.MetrologyCalibrationPlanItem;
  year: number;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const confirmLoading = ref(false);
const formRef = ref();
const isEditMode = computed(() => Boolean(props.record?.id));

interface FormState {
  actualDate?: string;
  instrumentId: string;
  planDay?: number;
  planMonth?: number;
  planYear: number;
  remark: string;
}

const formState = reactive<FormState>({
  actualDate: undefined,
  instrumentId: '',
  planDay: undefined,
  planMonth: undefined,
  planYear: new Date().getFullYear(),
  remark: '',
});

const rules: Record<string, Rule[]> = {
  instrumentId: [
    { required: true, message: t('common.pleaseSelect'), trigger: 'change' },
  ],
  planDay: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
  planMonth: [
    { required: true, message: t('common.pleaseSelect'), trigger: 'change' },
  ],
  planYear: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
};

watch(
  () => props.open,
  (value) => {
    if (!value) {
      formRef.value?.resetFields();
      return;
    }

    Object.assign(formState, {
      actualDate: props.record?.actualDate || undefined,
      instrumentId: props.record?.instrumentId || '',
      planDay: props.record?.planDay,
      planMonth: props.record?.planMonth,
      planYear: props.record?.planYear || props.year,
      remark: props.record?.remark || '',
    });
  },
);

async function handleOk() {
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    const payload: QmsMetrologyApi.MetrologyCalibrationPlanMutationPayload = {
      actualDate: formState.actualDate || null,
      instrumentId: formState.instrumentId,
      planDay: Number(formState.planDay),
      planMonth: Number(formState.planMonth),
      planYear: Number(formState.planYear),
      remark: String(formState.remark || '').trim() || null,
    };

    await (isEditMode.value && props.record?.id
      ? updateMetrologyCalibrationPlanMutation(props.record.id, payload)
      : createMetrologyCalibrationPlanMutation(payload));

    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'errorFields' in error) {
      return;
    }
    handleApiError(error, 'Save Metrology Calibration Plan');
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="props.open"
    :title="
      isEditMode
        ? t('qms.metrology.calibrationPlan.editTitle')
        : t('qms.metrology.calibrationPlan.createTitle')
    "
    :confirm-loading="confirmLoading"
    destroy-on-close
    @cancel="emit('update:open', false)"
    @ok="handleOk"
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      class="pt-4"
      layout="vertical"
    >
      <div class="grid grid-cols-2 gap-4">
        <Form.Item
          :label="t('qms.metrology.instrumentName')"
          name="instrumentId"
          class="col-span-2"
        >
          <Select
            v-model:value="formState.instrumentId"
            :options="props.instrumentOptions"
            show-search
            option-filter-prop="label"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.calibrationPlan.planYear')"
          name="planYear"
        >
          <InputNumber
            v-model:value="formState.planYear"
            :min="2000"
            :max="2100"
            :precision="0"
            class="w-full"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.calibrationPlan.planMonth')"
          name="planMonth"
        >
          <Select
            v-model:value="formState.planMonth"
            :options="getMonthOptions()"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.calibrationPlan.planDay')"
          name="planDay"
        >
          <InputNumber
            v-model:value="formState.planDay"
            :min="1"
            :max="31"
            :precision="0"
            class="w-full"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.calibrationPlan.actualDate')"
          name="actualDate"
        >
          <DatePicker
            v-model:value="formState.actualDate"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </Form.Item>

        <Form.Item
          :label="t('qms.metrology.calibrationPlan.remark')"
          name="remark"
          class="col-span-2"
        >
          <Input v-model:value="formState.remark" />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
