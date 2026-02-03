<script lang="ts" setup>
import type { ItpProjectForm } from '../../types';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Input, message, Modal, Select } from 'ant-design-vue';

import { createItpProject, updateItpProject } from '#/api/qms/planning';

import WorkOrderSelect from '../../../shared/components/WorkOrderSelect.vue';

const props = defineProps<{
  initialData: Partial<ItpProjectForm> & { workOrderNumber?: string };
  isEditMode: boolean;
  open: boolean;
  selectedProjectId: null | string;
}>();

const emit = defineEmits<{
  (e: 'success', id?: string): void;
  (e: 'update:open', val: boolean): void;
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive<ItpProjectForm>({
  projectName: '',
  workOrderId: '', // Use workOrderNumber directly
  version: 'V1.0',
  status: 'active',
});

const statusOptions = computed(() => [
  { value: 'draft', label: t('qms.planning.status.draft') },
  { value: 'active', label: t('qms.planning.status.active') },
]);

const rules: any = {
  projectName: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
  workOrderId: [
    {
      required: true,
      message: t('ui.formRules.selectRequired', [
        t('qms.planning.itp.relatedWorkOrder'),
      ]),
      trigger: 'change',
    },
  ],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      Object.assign(formState, {
        projectName: props.initialData.projectName || '',
        workOrderId:
          props.initialData.workOrderNumber ||
          props.initialData.workOrderId ||
          '',
        version: props.initialData.version || 'V1.0',
        status: props.initialData.status || 'active',
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

    // Mapping: workOrderId field in form actually holds workOrderNumber suitable for backend
    const payload = {
      ...formState,
      workOrderNumber: formState.workOrderId, // Backend expects workOrderNumber if creating
    };

    let newId: string | undefined;

    if (props.isEditMode && props.selectedProjectId) {
      await updateItpProject(props.selectedProjectId, payload);
    } else {
      const res = await createItpProject({
        ...payload,
        workOrderNumber: formState.workOrderId,
      });
      newId = res?.id;
    }

    message.success(t('common.saveSuccess'));
    emit('success', newId);
    emit('update:open', false);
  } catch (error: any) {
    if (error?.errorFields) return;
    console.error('ITP Project Save Error:', error);
    message.error(error?.message || t('common.actionFailed'));
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
        ? t('qms.planning.itp.editProject')
        : t('qms.planning.itp.createProject')
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
      <Form.Item :label="t('qms.planning.itp.planName')" name="projectName">
        <Input
          v-model:value="formState.projectName"
          :placeholder="t('common.pleaseInput')"
        />
      </Form.Item>
      <Form.Item
        :label="t('qms.planning.itp.relatedWorkOrder')"
        name="workOrderId"
      >
        <WorkOrderSelect
          v-model:value="formState.workOrderId"
          :disabled="isEditMode"
        />
      </Form.Item>
      <div class="grid grid-cols-2 gap-4">
        <Form.Item :label="t('common.version')" name="version">
          <Input v-model:value="formState.version" />
        </Form.Item>
        <Form.Item :label="t('common.status')" name="status">
          <Select v-model:value="formState.status" :options="statusOptions" />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
