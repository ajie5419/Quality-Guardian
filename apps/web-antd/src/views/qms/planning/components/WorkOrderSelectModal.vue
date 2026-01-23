<script lang="ts" setup>
import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { useVbenForm } from '#/adapter/form';
import { getWorkOrderList } from '#/api/qms/work-order';

const emit = defineEmits(['success']);

const workOrders = ref<any[]>([]);
const loading = ref(false);

const [Form, formApi] = useVbenForm({
  schema: [
    {
      fieldName: 'workOrderNumber',
      label: '选择工单',
      component: 'Select',
      rules: 'required',
      componentProps: {
        showSearch: true,
        placeholder: '请搜索并选择一个工单',
        filterOption: (input: string, option: any) => {
          return option.label.toLowerCase().includes(input.toLowerCase());
        },
      },
    },
  ],
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
});

const [Modal, modalApi] = useVbenModal({
  onConfirm: handleSubmit,
  title: '添加联动项目',
});

async function loadWorkOrders() {
  loading.value = true;
  try {
    const res = await getWorkOrderList();
    workOrders.value = res.items || [];

    await formApi.updateSchema([
      {
        fieldName: 'workOrderNumber',
        componentProps: {
          options: workOrders.value.map((wo) => ({
            label: `${wo.workOrderNumber} - ${wo.projectName || '未命名项目'}`,
            value: wo.workOrderNumber,
          })),
        },
      },
    ]);
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  try {
    const { valid } = await formApi.validate();
    if (!valid) return;

    const values = await formApi.getValues();
    emit('success', values.workOrderNumber);
    modalApi.close();
  } catch (error) {
    console.error('Selection failed:', error);
  }
}

function open() {
  modalApi.open();
  loadWorkOrders();
}

defineExpose({ open });
</script>

<template>
  <Modal>
    <div class="p-4">
      <p class="mb-4 text-sm text-gray-500">
        此操作将手动将选定的工单加入到当前模块的策划列表中。
      </p>
      <Form />
    </div>
  </Modal>
</template>
