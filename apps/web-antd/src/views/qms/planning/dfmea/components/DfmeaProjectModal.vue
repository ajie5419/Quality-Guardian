<script lang="ts" setup>
import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Input, message, Modal, Select } from 'ant-design-vue';

import { createDfmeaProject, updateDfmeaProject } from '#/api/qms/planning';

const props = defineProps<{
  initialData: any;
  isEditMode: boolean;
  open: boolean;
  selectedProjectId: null | string;
  workOrderList: QmsWorkOrderApi.WorkOrderItem[];
}>();

const emit = defineEmits<{
  success: [string?];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive({
  projectName: '',
  workOrderId: '',
  version: 'V1.0',
  status: 'active' as 'active' | 'archived' | 'draft',
});

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

const workOrderOptions = computed(() =>
  props.workOrderList.map((wo) => ({
    label: `${wo.workOrderNumber} - ${wo.projectName}`,
    value: wo.workOrderNumber, // 关键修复：改为使用 workOrderNumber，满足数据库外键约束
  })),
);

watch(
  () => props.open,
  (val) => {
    if (val) {
      Object.assign(formState, {
        projectName: props.initialData.projectName || '',
        workOrderId: props.initialData.workOrderId || '',
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

    const payload = { ...formState };
    let newId: string | undefined;

    if (props.isEditMode && props.selectedProjectId) {
      await updateDfmeaProject(props.selectedProjectId, payload);
    } else {
      const res = await createDfmeaProject(payload);
      newId = (res as any)?.id;
    }

    message.success(t('common.saveSuccess'));
    emit('success', newId);
    emit('update:open', false);
  } catch (error: any) {
    if (error?.errorFields) return;
    console.error('DFMEA Save Error:', error);
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
        <Select
          v-model:value="formState.workOrderId"
          class="w-full"
          show-search
          option-filter-prop="label"
          :options="workOrderOptions"
          :placeholder="t('common.pleaseSelect')"
        />
      </Form.Item>
      <div class="grid grid-cols-2 gap-4">
        <Form.Item :label="t('common.version')" name="version">
          <Input v-model:value="formState.version" />
        </Form.Item>
        <Form.Item :label="t('common.status')" name="status">
          <Select v-model:value="formState.status">
            <Select.Option value="draft">{{
              t('qms.planning.status.draft')
            }}</Select.Option>
            <Select.Option value="active">{{
              t('qms.planning.status.active')
            }}</Select.Option>
          </Select>
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
