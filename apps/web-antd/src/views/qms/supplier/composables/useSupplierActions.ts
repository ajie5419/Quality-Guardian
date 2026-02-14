import type { Ref } from 'vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import {
  batchDeleteSuppliers,
  deleteSupplier,
  importSuppliers,
} from '#/api/qms/supplier';
import { useErrorHandler } from '#/hooks/useErrorHandler';
import {
  mapRowsByColumnTitles,
  readImportRowsFromFile,
} from '#/utils/import-sheet';
import {
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';

export function useSupplierActions(options: {
  category: string;
  checkedRows: Ref<QmsSupplierApi.SupplierItem[]>;
  createValues?: Record<string, unknown>;
  detailDrawerRef: Ref<
    | {
        open: (
          row: QmsSupplierApi.SupplierItem,
          titlePrefix?: string,
        ) => Promise<void> | void;
      }
    | undefined
  >;
  detailTitleKey?: string;
  editModalRef: Ref<
    | {
        open: (options: {
          category: string;
          isUpdate: boolean;
          record?: QmsSupplierApi.SupplierItem;
          values?: Record<string, unknown>;
        }) => Promise<void> | void;
      }
    | undefined
  >;
  gridApi: unknown;
}) {
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();
  const {
    gridApi,
    editModalRef,
    detailDrawerRef,
    checkedRows,
    category,
    detailTitleKey = 'qms.supplier.title',
    createValues,
  } = options;

  function resolveGridApi(): {
    grid?: { getColumns: () => unknown[] };
    reload?: () => void;
  } {
    if (
      typeof gridApi === 'object' &&
      gridApi !== null &&
      'value' in gridApi &&
      typeof (gridApi as { value?: unknown }).value === 'object'
    ) {
      return ((gridApi as { value?: unknown }).value ||
        {}) as {
        grid?: { getColumns: () => unknown[] };
        reload?: () => void;
      };
    }
    if (typeof gridApi === 'object' && gridApi !== null) {
      return gridApi as {
        grid?: { getColumns: () => unknown[] };
        reload?: () => void;
      };
    }
    return {};
  }

  function handleSuccess() {
    const api = resolveGridApi();
    api.reload?.();
  }

  function handleOpenModal() {
    editModalRef.value?.open({
      isUpdate: false,
      category,
      values: createValues,
    });
  }

  function handleEdit(row: QmsSupplierApi.SupplierItem) {
    editModalRef.value?.open({
      isUpdate: true,
      record: row,
      category,
    });
  }

  function handleDelete(row: QmsSupplierApi.SupplierItem) {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: `${t('common.confirmDeleteContent')} [${row.name}] ?`,
      onOk: async () => {
        try {
          await deleteSupplier(row.id);
          message.success(t('common.deleteSuccess'));
          handleSuccess();
        } catch (error) {
          handleApiError(error, 'Delete Supplier');
        }
      },
    });
  }

  function handleBatchDelete() {
    if (checkedRows.value.length === 0) return;
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('common.confirmBatchDelete', {
        count: checkedRows.value.length,
      }),
      onOk: async () => {
        try {
          const ids = checkedRows.value.map((row) => row.id);
          await batchDeleteSuppliers(ids);
          message.success(t('common.deleteSuccess'));
          checkedRows.value = [];
          handleSuccess();
        } catch (error) {
          handleApiError(error, 'Batch Delete Supplier');
        }
      },
    });
  }

  function showDetail(row: QmsSupplierApi.SupplierItem) {
    detailDrawerRef.value?.open(row, t(detailTitleKey));
  }

  /**
   * Standardized custom import logic for Excel files
   */
  async function handleCustomImport({ file }: { file: File }) {
    try {
      const rows = await readImportRowsFromFile(file);
      const columns =
        (resolveGridApi().grid?.getColumns?.() as Array<{
          field?: null | string;
          title?: unknown;
        }>) || [];
      const mappedItems = mapRowsByColumnTitles(rows, columns);

      const res = await importSuppliers({
        items: mappedItems,
        category,
      });
      const { errorCount } = resolveImportErrorCount(res, mappedItems.length);

      if (res.successCount > 0) {
        message.success(
          t('common.importSuccessCount', { count: res.successCount }),
        );
        handleSuccess();
      }

      if (errorCount > 0) {
        message.warning(buildImportWarningMessage(res, errorCount));
      }
    } catch (error) {
      handleApiError(error, 'Import Supplier');
      message.error(t('common.importFailed'));
    }
  }

  return {
    handleOpenModal,
    handleEdit,
    handleDelete,
    handleBatchDelete,
    showDetail,
    handleCustomImport,
    handleSuccess,
  };
}
