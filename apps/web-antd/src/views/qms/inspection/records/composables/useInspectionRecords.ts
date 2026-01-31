import type { QmsInspectionApi } from '#/api/qms/inspection';

import { ref } from 'vue';

import { message } from 'ant-design-vue';

import {
  createInspectionRecord,
  updateInspectionRecord,
} from '#/api/qms/inspection';

export function useInspectionRecords() {
  const activeKey = ref('incoming');
  const currentYear = ref(new Date().getFullYear());
  const yearOptions = [2024, 2025, 2026].map((y) => ({
    label: `${y}年`,
    value: y,
  }));

  const gridRef = ref();
  const formRef = ref();
  const modalVisible = ref(false);
  const currentRecord = ref<QmsInspectionApi.InspectionRecord | undefined>(
    undefined,
  );
  const isEdit = ref(false);

  function openModal(record?: QmsInspectionApi.InspectionRecord) {
    isEdit.value = !!record;
    currentRecord.value = record || undefined;
    modalVisible.value = true;
  }

  async function handleSubmit() {
    if (!formRef.value) return;

    const values = formRef.value.getValues();
    // Transform category
    values.category = activeKey.value.toUpperCase();

    try {
      await (isEdit.value && currentRecord.value?.id
        ? updateInspectionRecord(currentRecord.value.id, values)
        : createInspectionRecord(values));
      message.success('保存成功');
      modalVisible.value = false;
      gridRef.value?.reload();
    } catch (error: any) {
      console.error('Submit failed:', error);
      message.error(error?.message || '提交失败，请重试');
    }
  }

  return {
    activeKey,
    currentYear,
    yearOptions,
    gridRef,
    formRef,
    modalVisible,
    currentRecord,
    isEdit,
    openModal,
    handleSubmit,
  };
}
