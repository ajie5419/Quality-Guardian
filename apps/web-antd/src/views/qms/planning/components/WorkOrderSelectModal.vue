<script lang="ts" setup>
import { ref, watch } from 'vue';

import { message, Modal } from 'ant-design-vue';

import WorkOrderSelect from '../../shared/components/WorkOrderSelect.vue';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  success: [string];
  'update:open': [boolean];
}>();

const workOrderNumber = ref<string | undefined>(undefined);
const confirmLoading = ref(false);

watch(
  () => props.open,
  (val) => {
    if (val) {
      workOrderNumber.value = undefined;
    }
  },
);

async function handleOk() {
  if (!workOrderNumber.value) {
    message.warning('请选择一个工单');
    return;
  }
  confirmLoading.value = true;
  try {
    emit('success', workOrderNumber.value);
    emit('update:open', false);
  } finally {
    confirmLoading.value = false;
  }
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Modal
    :open="open"
    title="添加联动项目"
    :confirm-loading="confirmLoading"
    @ok="handleOk"
    @cancel="handleCancel"
    destroy-on-close
  >
    <div class="pt-4">
      <p class="mb-4 text-sm text-gray-500">
        此操作将手动将选定的工单加入到当前模块的策划列表中。
      </p>
      <div class="mb-8">
        <label class="mb-1 block text-sm font-medium text-gray-700">
          选择工单 <span class="text-red-500">*</span>
        </label>
        <WorkOrderSelect
          v-model:value="workOrderNumber"
          placeholder="请搜索并选择一个工单"
        />
      </div>
    </div>
  </Modal>
</template>
