<script lang="ts" setup>
import type { Rule } from 'ant-design-vue/es/form';

import type { QmsPlanningApi } from '#/api/qms/planning';

import { reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import {
  Col,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Row,
} from 'ant-design-vue';

import { createBom, updateBom } from '#/api/qms/planning';

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
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive<
  Partial<QmsPlanningApi.BomItem> & { workOrderNumber?: string }
>({
  material: '',
  partName: '',
  partNumber: '',
  quantity: 1,
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
      Object.assign(formState, {
        material: props.initialData.material || '',
        partName: props.initialData.partName || '',
        partNumber: props.initialData.partNumber || '',
        quantity: props.initialData.quantity || 1,
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

    const payload = { ...formState };
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
    if ((error as any)?.errorFields) return;
    console.error('BOM Save Error:', error);
    const errorMessage =
      error instanceof Error ? error.message : t('common.actionFailed');
    message.error(errorMessage);
  } finally {
    confirmLoading.value = false;
  }
}
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
          <Form.Item
            :label="t('qms.planning.bom.partNumber')"
            name="partNumber"
          >
            <Input
              v-model:value="formState.partNumber"
              :placeholder="t('qms.planning.bom.placeholder.partNumber')"
            />
          </Form.Item>
        </Col>
        <Col :span="12">
          <Form.Item :label="t('qms.planning.bom.material')" name="material">
            <Input
              v-model:value="formState.material"
              :placeholder="t('qms.planning.bom.placeholder.material')"
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
