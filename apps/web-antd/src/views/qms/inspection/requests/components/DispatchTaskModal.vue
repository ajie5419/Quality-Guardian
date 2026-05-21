<script setup lang="ts">
import { reactive, watch } from 'vue';

import { Form, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';

interface Props {
  open: boolean;
  submitting: boolean;
  userOptions: Array<{ label: string; value: string }>;
  form: {
    dispatchRemark: string;
    inspectorId: string;
    priority: number;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  submit: [];
  'update:form': [value: Props['form']];
  'update:open': [value: boolean];
}>();
const { modalWidth, modalWrapClassName } = useAdaptivePopup();

const localForm = reactive({
  dispatchRemark: '',
  inspectorId: '',
  priority: 3,
});

function syncFromProps() {
  localForm.dispatchRemark = props.form.dispatchRemark;
  localForm.inspectorId = props.form.inspectorId;
  localForm.priority = props.form.priority;
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      syncFromProps();
    }
  },
  { immediate: true },
);

watch(
  localForm,
  (value) => {
    emit('update:form', {
      dispatchRemark: value.dispatchRemark,
      inspectorId: value.inspectorId,
      priority: value.priority,
    });
  },
  { deep: true },
);

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

function handleSubmit() {
  emit('update:form', {
    dispatchRemark: localForm.dispatchRemark,
    inspectorId: localForm.inspectorId,
    priority: localForm.priority,
  });
  emit('submit');
}
</script>

<template>
  <Modal
    :open="props.open"
    title="派发检验任务"
    :width="modalWidth"
    :wrap-class-name="modalWrapClassName"
    :confirm-loading="props.submitting"
    @ok="handleSubmit"
    @update:open="handleUpdateOpen"
  >
    <Form layout="vertical">
      <Form.Item label="检验员" required>
        <Select
          v-model:value="localForm.inspectorId"
          show-search
          :options="props.userOptions"
        />
      </Form.Item>
      <Form.Item label="优先级">
        <InputNumber
          v-model:value="localForm.priority"
          :min="1"
          :max="5"
          class="w-full"
        />
      </Form.Item>
      <Form.Item label="派单备注">
        <Input.TextArea v-model:value="localForm.dispatchRemark" />
      </Form.Item>
    </Form>
  </Modal>
</template>
