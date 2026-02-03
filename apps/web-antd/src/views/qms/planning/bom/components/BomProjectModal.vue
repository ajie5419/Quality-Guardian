<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Input, message, Modal, Select } from 'ant-design-vue';

import { updateBomProject } from '#/api/qms/planning';

const props = defineProps<{
  initialData: any;
  open: boolean;
  projectId: null | string;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive({
  projectName: '',
  status: 'active',
  workOrderNumber: '',
});

const rules: any = {
  projectName: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      Object.assign(formState, {
        projectName:
          props.initialData.projectName || props.initialData.name || '',
        status: props.initialData.status || 'active',
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

    if (props.projectId) {
      await updateBomProject(props.projectId, {
        projectName: formState.projectName,
        status: formState.status as any,
      });
      message.success(t('common.saveSuccess'));
    }

    emit('success');
    emit('update:open', false);
  } catch (error: any) {
    if (error?.errorFields) return;
    console.error('BOM Project Save Error:', error);
    message.error(error?.message || t('common.actionFailed'));
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('qms.planning.bom.editProject')"
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

      <Form.Item :label="t('qms.planning.bom.projectName')" name="projectName">
        <Input
          v-model:value="formState.projectName"
          :placeholder="t('common.pleaseInput')"
        />
      </Form.Item>

      <Form.Item :label="t('common.status')" name="status">
        <Select v-model:value="formState.status">
          <Select.Option value="active">{{
            t('qms.planning.status.active')
          }}</Select.Option>
          <Select.Option value="archived">{{
            t('qms.planning.status.archived')
          }}</Select.Option>
        </Select>
      </Form.Item>
    </Form>
  </Modal>
</template>
