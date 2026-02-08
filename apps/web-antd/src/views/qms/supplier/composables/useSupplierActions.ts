import type { Ref } from 'vue';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { useI18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import { batchDeleteSuppliers, deleteSupplier } from '#/api/qms/supplier';

export function useSupplierActions(options: {
  category: string;
  checkedRows: Ref<QmsSupplierApi.SupplierItem[]>;
  detailDrawerRef: Ref<any>;
  editModalRef: Ref<any>;
  gridApi: any;
}) {
  const { t } = useI18n();
  const { gridApi, editModalRef, detailDrawerRef, checkedRows, category } =
    options;

  function handleSuccess() {
    // Determine if it's a ref or a direct object
    const api = gridApi?.value || gridApi;
    api?.reload();
  }

  function handleOpenModal() {
    editModalRef.value?.open({ isUpdate: false, category });
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
          console.error('Delete failed:', error);
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
          console.error('Batch delete failed:', error);
        }
      },
    });
  }

  function showDetail(row: QmsSupplierApi.SupplierItem) {
    detailDrawerRef.value?.open(row, t('qms.supplier.title'));
  }

  /**
   * Standardized custom import logic for Excel files
   */
  async function handleCustomImport({ file }: { file: File }) {
    const { requestClient } = await import('#/api/request');
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

      const res = await requestClient.post(
        `/qms/supplier/import`,
        {
          items: mappedItems,
          category,
        },
        { timeout: 120_000 },
      );

      if (res.successCount > 0) {
        message.success(
          t('common.importSuccessCount', { count: res.successCount }),
        );
        handleSuccess();
      }
    } catch (error) {
      console.error('Import Error:', error);
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
