import { ref } from 'vue';
import { useI18n } from '@vben/locales';
import { message } from 'ant-design-vue';
import { importWorkOrders } from '#/api/qms/work-order';
import type { WorkOrderImportRow, ImportResponse } from '../types/workOrder';
import {
  WORK_ORDER_FIELD_MAP,
  IMPORT_STATUS_MAP,
  SUPPORTED_IMPORT_TYPES,
  IMPORT_TIMEOUT,
} from '../constants';

interface ImportParams {
  file: File;
}

export function useWorkOrderImport(onSuccess: () => void) {
  const { t } = useI18n();
  const loading = ref(false);

  const handleImport = async ({ file }: ImportParams) => {
    if (loading.value) return;
    loading.value = true;

    try {
      // 1. 文件类型校验
      const fileExt = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      const isTypeValid =
        SUPPORTED_IMPORT_TYPES.extensions.includes(fileExt) ||
        SUPPORTED_IMPORT_TYPES.mimeTypes.includes(file.type);

      if (!isTypeValid) {
        message.warning(t('qms.common.fileTypeInvalid'));
        loading.value = false;
        return;
      }

      // 2. 动态导入 XLSX
      const XLSX = await import('xlsx');

      // 3. 读取文件
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await file.arrayBuffer();
      } catch (err) {
        message.error(t('qms.common.fileReadFailed'));
        loading.value = false;
        return;
      }

      // 4. Excel 解析
      const workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
      });

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        message.warning(t('common.noData'));
        loading.value = false;
        return;
      }

      const worksheet = workbook.Sheets[sheetName];
      const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<
        string,
        any
      >[];

      if (rawData.length === 0) {
        message.warning(t('common.noData'));
        loading.value = false;
        return;
      }

      // 限制最大行数（防止浏览器崩溃）
      if (rawData.length > 10000) {
        message.warning(t('qms.common.fileTooLarge', { max: 10000 }));
        loading.value = false;
        return;
      }

      // 5. 字段映射与转换
      const mappedItems: WorkOrderImportRow[] = rawData.map((row) => {
        const item: WorkOrderImportRow = {};

        if (!row || typeof row !== 'object') return item;

        Object.entries(WORK_ORDER_FIELD_MAP).forEach(
          ([field, possibleHeaders]) => {
            const excelKey = Object.keys(row).find((k) =>
              possibleHeaders.some(
                (h) =>
                  k.replace(/\s+/g, '').toLowerCase() ===
                  h.replace(/\s+/g, '').toLowerCase(),
              ),
            );

            if (!excelKey) return;

            let val = row[excelKey];
            if (val === undefined || val === null) return;

            // 日期转换（使用本地时间，避免时区陷阱）
            if (['deliveryDate', 'effectiveTime'].includes(field)) {
              if (val instanceof Date && !isNaN(val.getTime())) {
                const y = val.getFullYear();
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const d = String(val.getDate()).padStart(2, '0');
                item[field as keyof WorkOrderImportRow] = `${y}-${m}-${d}`;
              } else if (typeof val === 'string' && val.trim()) {
                item[field as keyof WorkOrderImportRow] = val.trim();
              }
            }
            // 数量转换
            else if (field === 'quantity') {
              item.quantity = Number(val) || 0;
            }
            // 状态转换
            else if (field === 'status') {
              const statusKey = String(val).trim();
              item.status = IMPORT_STATUS_MAP[statusKey] || 'OPEN';
            }
            // 普通字段
            else {
              item[field as keyof WorkOrderImportRow] =
                String(val).trim() || undefined;
            }
          },
        );

        return item;
      });

      // 6. 提交导入
      const res = await importWorkOrders(mappedItems);

      // 7. 结果反馈
      if (res.successCount > 0) {
        const failTip = res.failCount ? `，失败${res.failCount}条` : '';
        message.success(
          t('qms.common.importSuccessCount', { count: res.successCount }) +
            failTip,
        );
        onSuccess();
      } else {
        const failReason = res.failItems?.[0]?.reason || '';
        message.error(
          t('qms.common.importFailed') + (failReason ? `：${failReason}` : ''),
        );
      }
    } catch (error: any) {
      console.error('Import Error:', error);
      message.error(
        t('qms.common.importFailed') +
          (error.message ? `: ${error.message}` : ''),
      );
    } finally {
      loading.value = false;
    }
  };

  return {
    handleImport,
    loading,
  };
}
