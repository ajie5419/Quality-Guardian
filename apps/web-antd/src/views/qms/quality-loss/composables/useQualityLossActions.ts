import type { QmsQualityLossApi } from '#/api/qms/quality-loss';
import type { VxeCheckboxChangeParams } from '#/types';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import {
  batchDeleteQualityLoss,
  deleteQualityLoss,
} from '#/api/qms/quality-loss';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { LossSource } from '../types';

interface GridApiLike {
  reload: () => void;
}

export function useQualityLossActions(
  gridApi: GridApiLike,
  invalidateFn: () => void,
) {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();
  const checkedRows = ref<QmsQualityLossApi.QualityLossItem[]>([]);
  const modalVisible = ref(false);
  const isEditMode = ref(false);
  const claimModalVisible = ref(false);
  const currentRecord = ref<Partial<QmsQualityLossApi.QualityLossItem>>({});

  function onCheckChange(
    params: VxeCheckboxChangeParams<QmsQualityLossApi.QualityLossItem>,
  ) {
    const records = params.$grid.getCheckboxRecords() || [];
    checkedRows.value = records;
  }

  function handleOpenModal() {
    isEditMode.value = false;
    currentRecord.value = {
      actualClaim: 0,
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      description: '',
      responsibleDepartment: undefined,
      status: 'PENDING',
      type: 'Scrap',
      lossSource: LossSource.MANUAL,
    };
    modalVisible.value = true;
  }

  function handleEdit(row: QmsQualityLossApi.QualityLossItem) {
    isEditMode.value = true;
    currentRecord.value = { ...row };
    modalVisible.value = true;
  }

  function handleClaim(row: QmsQualityLossApi.QualityLossItem) {
    currentRecord.value = { ...row };
    claimModalVisible.value = true;
  }

  async function handleDelete(row: QmsQualityLossApi.QualityLossItem) {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmDeleteContent'),
      onOk: async () => {
        try {
          await deleteQualityLoss(row.id);
          message.success(t('common.deleteSuccess'));
          invalidateFn();
          gridApi.reload();
        } catch (error) {
          handleApiError(error, 'Delete Quality Loss');
        }
      },
    });
  }

  function handleBatchDelete() {
    if (checkedRows.value.length === 0) return;

    const hasAutoRecords = checkedRows.value.some(
      (r) => r.lossSource !== LossSource.MANUAL,
    );
    if (hasAutoRecords) {
      message.warning('只能批量删除手动录入的损失记录');
      return;
    }

    Modal.confirm({
      title: t('common.confirmBatchDelete'),
      content: t('common.confirmBatchDeleteContent', {
        count: checkedRows.value.length,
      }),
      onOk: async () => {
        try {
          const ids = checkedRows.value.map((r) => r.id);
          const res = await batchDeleteQualityLoss(ids);
          message.success(
            t('common.deleteSuccessCount', { count: res.successCount }),
          );
          checkedRows.value = [];
          invalidateFn();
          gridApi.reload();
        } catch (error) {
          handleApiError(error, 'Batch Delete Quality Loss');
        }
      },
    });
  }

  return {
    checkedRows,
    modalVisible,
    isEditMode,
    claimModalVisible,
    currentRecord,
    onCheckChange,
    handleOpenModal,
    handleEdit,
    handleClaim,
    handleDelete,
    handleBatchDelete,
  };
}
