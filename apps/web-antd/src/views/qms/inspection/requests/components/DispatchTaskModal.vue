<script setup lang="ts">
import type { InspectionRequest } from '@qgs/shared';

import { reactive, ref, watch } from 'vue';

import { Form, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import { useAdaptivePopup } from '#/hooks/useAdaptivePopup';

import DispatchMaterialReview from './DispatchMaterialReview.vue';

interface Props {
  title?: string;
  open: boolean;
  request?: InspectionRequest;
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
  materialApproved: [request: InspectionRequest];
  submit: [];
  'update:form': [value: Props['form']];
  'update:open': [value: boolean];
}>();
const { modalWidth, modalWrapClassName } = useAdaptivePopup();
const materialReviewRef = ref<InstanceType<typeof DispatchMaterialReview>>();
const materialReviewSaving = ref(false);

const requiresMaterialReview = () =>
  props.request?.dispatchBlockedReason === 'MATERIAL_APPROVAL_PENDING';

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
  if (requiresMaterialReview()) {
    void materialReviewRef.value?.approve();
    return;
  }
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
    :title="props.title || '派发检验任务'"
    :width="modalWidth"
    :wrap-class-name="modalWrapClassName"
    :confirm-loading="props.submitting || materialReviewSaving"
    :ok-text="requiresMaterialReview() ? '审核并继续' : '确定派单'"
    @ok="handleSubmit"
    @update:open="handleUpdateOpen"
  >
    <DispatchMaterialReview
      v-if="props.request && requiresMaterialReview()"
      ref="materialReviewRef"
      :request="props.request"
      @approved="(request) => emit('materialApproved', request)"
      @saving="(value) => (materialReviewSaving = value)"
    />
    <Form v-else layout="vertical">
      <Form.Item label="检验员" required>
        <Select
          v-model:value="localForm.inspectorId"
          show-search
          allow-clear
          :options="props.userOptions"
          :filter-option="
            (input, option) =>
              String(option?.label || '')
                .toLowerCase()
                .includes(
                  String(input || '')
                    .trim()
                    .toLowerCase(),
                )
          "
          placeholder="输入姓名或账号搜索"
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
