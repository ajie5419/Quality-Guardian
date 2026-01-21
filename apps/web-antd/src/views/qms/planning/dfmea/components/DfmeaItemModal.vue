<script lang="ts" setup>
import { reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { Form, Input, InputNumber, message, Modal } from 'ant-design-vue';

import { createDfmea, updateDfmea } from '#/api/qms/planning';

const props = defineProps<{
  currentItemId: null | string;
  initialData: any;
  isEditMode: boolean;
  open: boolean;
  selectedProjectId: null | string;
}>();

const emit = defineEmits<{
  success: [];
  'update:open': [boolean];
}>();

const { t } = useI18n();
const confirmLoading = ref(false);
const formRef = ref();

const formState = reactive({
  item: '',
  failureMode: '',
  effects: '',
  severity: 5,
  occurrence: 5,
  detection: 5,
});

const rules: any = {
  item: [{ required: true, message: t('common.pleaseInput'), trigger: 'blur' }],
  failureMode: [
    { required: true, message: t('common.pleaseInput'), trigger: 'blur' },
  ],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      Object.assign(formState, {
        item: props.initialData.item || props.initialData.name || '',
        failureMode: props.initialData.failureMode || '',
        effects: props.initialData.effects || '',
        severity: props.initialData.severity || 5,
        occurrence: props.initialData.occurrence || 5,
        detection: props.initialData.detection || 5,
      });
    } else {
      formRef.value?.resetFields();
    }
  },
);

async function handleOk() {
  if (!props.selectedProjectId) return;
  try {
    await formRef.value?.validate();
    confirmLoading.value = true;

    const payload = {
      ...formState,
      projectId: props.selectedProjectId,
      effect: formState.effects, // 后端 schema 字段是 effect (单数)
    };

    await (props.isEditMode && props.currentItemId
      ? updateDfmea(props.currentItemId, payload)
      : createDfmea(payload));

    message.success(t('common.saveSuccess'));
    emit('success');
    emit('update:open', false);
  } catch (error: any) {
    if (error?.errorFields) return;
    message.error(t('common.actionFailed'));
  } finally {
    confirmLoading.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="isEditMode ? t('common.edit') : t('common.add')"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="emit('update:open', false)"
    width="600px"
    destroy-on-close
  >
    <Form
      ref="formRef"
      :model="formState"
      :rules="rules"
      layout="vertical"
      class="pt-4"
    >
      <Form.Item :label="t('qms.planning.dfmea.item')" name="item">
        <Input v-model:value="formState.item" />
      </Form.Item>
      <Form.Item
        :label="t('qms.planning.dfmea.failureMode')"
        name="failureMode"
      >
        <Input v-model:value="formState.failureMode" />
      </Form.Item>
      <Form.Item :label="t('qms.planning.dfmea.effects')" name="effects">
        <Input.TextArea v-model:value="formState.effects" />
      </Form.Item>
      <div class="grid grid-cols-3 gap-4">
        <Form.Item :label="t('qms.planning.dfmea.severity')" name="severity">
          <InputNumber
            v-model:value="formState.severity"
            :min="1"
            :max="10"
            class="w-full"
          />
        </Form.Item>
        <Form.Item
          :label="t('qms.planning.dfmea.occurrence')"
          name="occurrence"
        >
          <InputNumber
            v-model:value="formState.occurrence"
            :min="1"
            :max="10"
            class="w-full"
          />
        </Form.Item>
        <Form.Item :label="t('qms.planning.dfmea.detection')" name="detection">
          <InputNumber
            v-model:value="formState.detection"
            :min="1"
            :max="10"
            class="w-full"
          />
        </Form.Item>
      </div>
    </Form>
  </Modal>
</template>
