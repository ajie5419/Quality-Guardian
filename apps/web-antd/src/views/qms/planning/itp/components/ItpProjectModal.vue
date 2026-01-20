<script lang="ts" setup>
import { reactive, watch, ref, computed } from 'vue';
import { useI18n } from '@vben/locales';
import { Modal, Form, Input, Select, message } from 'ant-design-vue';
import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import { createItpProject, updateItpProject } from '#/api/qms/planning';
import type { ItpProjectForm } from '../../types';

const props = defineProps<{
  open: boolean;
  isEditMode: boolean;
  initialData: Partial<ItpProjectForm>;
  workOrderList: QmsWorkOrderApi.WorkOrderItem[];
  selectedProjectId: string | null;
}>();

const emit = defineEmits<{
  'update:open': [boolean];
  success: [string?];
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive<ItpProjectForm>({
  projectName: '',
  workOrderId: '',
  version: 'V1.0',
  status: 'active',
});

const rules = {
  projectName: [{ required: true, message: t('common.pleaseInput'), trigger: 'blur' }],
  workOrderId: [{ required: true, message: t('ui.formRules.selectRequired', [t('qms.planning.itp.relatedWorkOrder')]), trigger: 'change' }],
};

const workOrderOptions = computed(() => 
  (props.workOrderList || []).map(wo => ({
    label: `${wo.workOrderNumber} - ${wo.projectName}`,
    value: wo.workOrderNumber // 关键修复：改为使用 workOrderNumber
  }))
);

watch(() => props.open, (val) => {
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
});

async function handleOk() {
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;
    
    const payload = { ...formState };
    let newId: string | undefined;
    
    if (props.isEditMode && props.selectedProjectId) {
      await updateItpProject(props.selectedProjectId, payload);
    } else {
      const res = await createItpProject(payload);
      newId = (res as any)?.id;
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
    :title="isEditMode ? t('qms.planning.itp.editProject') : t('qms.planning.itp.createProject')"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    destroy-on-close
  >
    <Form ref="formRef" :model="formState" :rules="rules" layout="vertical" class="pt-4">
      <Form.Item :label="t('qms.planning.itp.planName')" name="projectName">
        <Input v-model:value="formState.projectName" :placeholder="t('common.pleaseInput')" />
      </Form.Item>
      <Form.Item :label="t('qms.planning.itp.relatedWorkOrder')" name="workOrderId">
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
              <Select.Option value="draft">{{ t('qms.planning.status.draft') }}</Select.Option>
              <Select.Option value="active">{{ t('qms.planning.status.active') }}</Select.Option>
            </Select>
          </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
