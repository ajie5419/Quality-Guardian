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
  buildImportWarningMessage,
  resolveImportErrorCount,
} from '#/utils/import-summary';

export function useSupplierActions(options: {
  category: string;
  checkedRows: Ref<QmsSupplierApi.SupplierItem[]>;
  createValues?: Record<string, unknown>;
  detailDrawerRef: Ref<any>;
  detailTitleKey?: string;
  editModalRef: Ref<any>;
  gridApi: any;
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

  function handleSuccess() {
    // Determine if it's a ref or a direct object
    const api = gridApi?.value || gridApi;
    api?.reload();
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
    const XLSX = await import('xlsx');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
      });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return;
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return;
      const results = XLSX.utils.sheet_to_json(worksheet) as any[];

      const columns = gridApi.value.grid.getColumns();
      const mappedItems = results.map((row: any) => {
        const item: any = {};
        columns.forEach((c: any) => {
          if (!c.field || !c.title) return;
          const excelKey = Object.keys(row).find(
            (k) =>
              String(k).replaceAll(/\s+/g, '') ===
              String(c.title).replaceAll(/\s+/g, ''),
          );
          if (excelKey) {
            let val = row[excelKey];
            if (val instanceof Date) {
              val = val.toISOString().split('T')[0];
            }
            item[c.field] = val;
          }
        });
        return item;
      });

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
