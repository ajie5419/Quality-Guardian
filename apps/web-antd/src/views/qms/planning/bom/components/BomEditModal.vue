<script lang="ts" setup>
import type { Rule } from 'ant-design-vue/es/form';

import type { QmsPlanningApi } from '#/api/qms/planning';

import { onMounted, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
  Select,
} from 'ant-design-vue';

import { createBom, getBomProcessOptions, updateBom } from '#/api/qms/planning';
import { useErrorHandler } from '#/hooks/useErrorHandler';

const props = defineProps<{
  currentId: null | string;
  initialData: Partial<QmsPlanningApi.BomItem> & { workOrderNumber?: string };
  isEditMode: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const { handleApiError } = useErrorHandler();
const confirmLoading = ref(false);
const formRef = ref();
const processOptions = ref<Array<{ label: string; value: string }>>([]);
const requiredProcessSelectionTouched = ref(false);

const formState = reactive<
  Partial<QmsPlanningApi.BomItem> & { workOrderNumber?: string }
>({
  partName: '',
  partNumber: '',
  quantity: 1,
  requiredProcessIds: [],
  requiredProcesses: [],
  remarks: '',
  unit: 'PCS',
  workOrderNumber: '',
});

const rules: Record<string, Rule[]> = {
  partName: [
    {
      required: true,
      message: t('qms.planning.bom.placeholder.partName'),
      trigger: 'blur',
    },
  ],
  partNumber: [
    {
      required: true,
      message: t('qms.planning.bom.placeholder.partNumber'),
      trigger: 'blur',
    },
  ],
  quantity: [
    {
      required: true,
      type: 'number',
      message: t('common.pleaseInput'),
      trigger: 'change',
    },
  ],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      requiredProcessSelectionTouched.value = false;
      Object.assign(formState, {
        partName: props.initialData.partName || '',
        partNumber: props.initialData.partNumber || '',
        quantity: props.initialData.quantity || 1,
        requiredProcessIds: props.initialData.requiredProcessIds || [],
        requiredProcesses: props.initialData.requiredProcesses || [],
        remarks: props.initialData.remarks || '',
        unit: props.initialData.unit || 'PCS',
        workOrderNumber: props.initialData.workOrderNumber || '',
      });
    } else {
      formRef.value?.resetFields();
    }
  },
);

async function handleOk() {
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    const processNameById = new Map(
      processOptions.value.map((option) => [option.value, option.label]),
    );
    const {
      requiredProcessIds,
      requiredProcesses: _snapshot,
      ...basePayload
    } = formState;
    const replacesProcessIdentities =
      !props.isEditMode || requiredProcessSelectionTouched.value;
    const payload: Partial<QmsPlanningApi.BomItem> = { ...basePayload };
    if (replacesProcessIdentities) {
      payload.requiredProcessIds = requiredProcessIds || [];
      payload.requiredProcesses = (requiredProcessIds || []).map(
        (processId) => processNameById.get(processId) || '',
      );
    }
    if (props.isEditMode && props.currentId) {
      await updateBom(props.currentId, payload as QmsPlanningApi.BomItem);
      message.success(t('common.saveSuccess'));
    } else {
      await createBom(payload as QmsPlanningApi.BomItem);
      message.success(t('common.createSuccess'));
    }
    emit('success');
    emit('update:open', false);
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'errorFields' in error)
      return;
    handleApiError(error, 'Save BOM Item');
    const errorMessage =
      error instanceof Error ? error.message : t('common.actionFailed');
    message.error(errorMessage);
  } finally {
    confirmLoading.value = false;
  }
}

onMounted(async () => {
  processOptions.value = await getBomProcessOptions();
});
</script>

<template>
  <Modal
    :open="open"
    :title="
      isEditMode
        ? t('qms.planning.bom.editItem')
        : t('qms.planning.bom.addItem')
    "
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    width="700px"
    destroy-on-close
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-4"
    >
      <Row :gutter="16">
        <Col :span="12">
          <Form.Item
            :label="t('qms.planning.bom.workOrderNo')"
            name="workOrderNumber"
          >
            <Input
              v-model:value="formState.workOrderNumber"
              disabled
              class="bg-gray-50"
            />
          </Form.Item>
        </Col>
        <Col :span="12">
          <Form.Item :label="t('qms.planning.bom.partName')" name="partName">
            <Input
              v-model:value="formState.partName"
              :placeholder="t('qms.planning.bom.placeholder.partName')"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row :gutter="16">
        <Col :span="12">
          <Form.Item label="图号" name="partNumber">
            <Input
              v-model:value="formState.partNumber"
              :placeholder="t('qms.planning.bom.placeholder.partNumber')"
            />
          </Form.Item>
        </Col>
        <Col :span="12">
          <Form.Item label="所需检验工序" name="requiredProcessIds">
            <Select
              v-model:value="formState.requiredProcessIds"
              mode="multiple"
              allow-clear
              :options="processOptions"
              placeholder="请选择所需检验工序"
              @change="requiredProcessSelectionTouched = true"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row :gutter="16">
        <Col :span="12">
          <Form.Item :label="t('qms.planning.bom.quantity')" name="quantity">
            <InputNumber
              v-model:value="formState.quantity"
              class="w-full"
              :min="1"
            />
          </Form.Item>
        </Col>
        <Col :span="12">
          <Form.Item :label="t('qms.planning.bom.unit')" name="unit">
            <Input
              v-model:value="formState.unit"
              :placeholder="t('qms.planning.bom.placeholder.unit')"
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item :label="t('qms.planning.bom.remarks')" name="remarks">
        <Input.TextArea
          v-model:value="formState.remarks"
          :rows="3"
          :placeholder="t('qms.planning.bom.placeholder.remarks')"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
