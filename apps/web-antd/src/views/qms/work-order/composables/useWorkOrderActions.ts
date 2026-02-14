import type { Ref } from 'vue';

import type { QmsWorkOrderApi } from '#/api/qms/work-order';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import { batchDeleteWorkOrders, deleteWorkOrder } from '#/api/qms/work-order';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import { useInvalidateQmsQueries } from '#/hooks/useQmsQueries';
import type { TreeSelectNode } from '#/types';
import type { OpenParams, WorkOrderRecord } from '../types/workOrder';

interface EditModalLike {
  open: (params?: OpenParams) => Promise<void> | void;
}

interface GridApiLike {
  reload: () => void;
}

export function useWorkOrderActions(options: {
  checkedRows: Ref<QmsWorkOrderApi.WorkOrderItem[]>;
  deptTreeData: Ref<TreeSelectNode[]>;
  editModalRef: Ref<EditModalLike | null>;
  gridApi: Ref<GridApiLike | undefined>;
}) {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();
  const { invalidateWorkOrders } = useInvalidateQmsQueries();
  const { gridApi, deptTreeData, editModalRef, checkedRows } = options;

  function handleSuccess() {
    invalidateWorkOrders();
    gridApi.value?.reload();
  }

  function handleAdd() {
    if (editModalRef.value) {
      editModalRef.value.open({ record: null, deptData: deptTreeData.value });
    } else {
      message.warning(t('qms.common.loading'));
    }
  }

  function handleEdit(row: QmsWorkOrderApi.WorkOrderItem) {
    const normalizedRecord: WorkOrderRecord = {
      workOrderNumber: row.workOrderNumber,
      customerName: row.customerName || '',
      projectName: row.projectName || null,
      division: row.division || null,
      quantity: row.quantity || 0,
      deliveryDate: row.deliveryDate || '',
      status: row.status,
      effectiveTime: row.effectiveTime || null,
    };
    if (editModalRef.value) {
      editModalRef.value.open({
        record: normalizedRecord,
        deptData: deptTreeData.value,
      });
    }
  }

  function handleDelete(row: QmsWorkOrderApi.WorkOrderItem) {
    Modal.confirm({
      title: t('qms.common.confirmDelete'),
      content: `${t('qms.common.confirmDeleteContent')} ${row.workOrderNumber}?`,
      onOk: async () => {
        try {
          await deleteWorkOrder(row.workOrderNumber);
          message.success(t('qms.common.deleteSuccess'));
          handleSuccess();
        } catch (error) {
          handleApiError(error, 'Delete Work Order');
          message.error(t('qms.common.deleteFailed'));
        }
      },
    });
  }

  function handleBatchDelete() {
    if (checkedRows.value.length === 0) return;

    Modal.confirm({
      title: t('qms.common.confirmBatchDelete'),
      content: t('qms.common.confirmBatchDeleteContent', {
        count: checkedRows.value.length,
      }),
      onOk: async () => {
        try {
          const ids = checkedRows.value.map((r) => r.workOrderNumber);
          const res = await batchDeleteWorkOrders(ids);
          message.success(
            t('qms.common.deleteSuccessCount', { count: res.successCount }),
          );
          checkedRows.value = [];
          handleSuccess();
        } catch (error) {
          handleApiError(error, 'Batch Delete Work Orders');
          message.error(t('qms.common.deleteFailed'));
        }
      },
    });
  }

  return {
    handleAdd,
    handleEdit,
    handleDelete,
    handleBatchDelete,
    handleSuccess,
  };
}
