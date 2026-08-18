import type { QmsInspectionApi } from '#/api/qms/inspection';

import { computed, ref } from 'vue';

import { message } from 'ant-design-vue';

import {
  createInspectionRecord,
  updateInspectionRecord,
} from '#/api/qms/inspection';
import { useAvailableYears } from '#/hooks/useAvailableYears';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface FormRefLike {
  getValues: () => Promise<Record<string, unknown>>;
  validate: () => Promise<void>;
}

interface GridRefLike {
  reload: () => void;
}

export function useInspectionRecords() {
  const { handleApiError } = useErrorHandler();
  const activeKey = ref('incoming');
  const currentYear = ref(new Date().getFullYear());
  const { years: availableYears } = useAvailableYears(['inspection-record']);
  const yearOptions = computed(() =>
    availableYears.value.map((y) => ({
      label: `${y}年`,
      value: y,
    })),
  );

  const gridRef = ref<GridRefLike>();
  const formRef = ref<FormRefLike>();
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

    try {
      await formRef.value.validate();
      const values = await formRef.value.getValues();
      // Transform category
      values.category = activeKey.value.toUpperCase();

      await (isEdit.value && currentRecord.value?.id
        ? updateInspectionRecord(currentRecord.value.id, values)
        : createInspectionRecord(values));

      message.success('保存成功');
      modalVisible.value = false;
      currentRecord.value = undefined;
      gridRef.value?.reload();
    } catch (error: unknown) {
      handleApiError(error, 'Submit Inspection Record');
      let errorMsg = '提交失败，请重试';
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === 'string') {
        errorMsg = error;
      }
      message.error(errorMsg);
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
