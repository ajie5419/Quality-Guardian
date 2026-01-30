import type { WorkOrderImportRow } from '../types/workOrder';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { importWorkOrders } from '#/api/qms/work-order';

import {
  IMPORT_STATUS_MAP,
  SUPPORTED_IMPORT_TYPES,
  WORK_ORDER_FIELD_MAP,
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
      } catch {
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
      if (!worksheet) {
        message.warning(t('common.noData'));
        loading.value = false;
        return;
      }

      const rawData = XLSX.utils.sheet_to_json(worksheet) as Record<
        string,
        unknown
      >[];

      if (rawData.length === 0) {
        message.warning(t('common.noData'));
        loading.value = false;
        return;
      }

      // 限制最大行数（防止浏览器崩溃）
      if (rawData.length > 10_000) {
        message.warning(t('qms.common.fileTooLarge', { max: 10_000 }));
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
                  k.replaceAll(/\s+/g, '').toLowerCase() ===
                  h.replaceAll(/\s+/g, '').toLowerCase(),
              ),
            );

            if (!excelKey) return;

            const val = row[excelKey];
            if (val === undefined || val === null) return;

            // 日期转换（使用本地时间，避免时区陷阱）
            if (['deliveryDate', 'effectiveTime'].includes(field)) {
              if (val instanceof Date && !Number.isNaN(val.getTime())) {
                const y = val.getFullYear();
                const m = String(val.getMonth() + 1).padStart(2, '0');
                const d = String(val.getDate()).padStart(2, '0');
                (item as Record<string, unknown>)[field] = `${y}-${m}-${d}`;
              } else if (typeof val === 'string' && val.trim()) {
                (item as Record<string, unknown>)[field] = val.trim();
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
              (item as Record<string, unknown>)[field] =
                String(val).trim() || undefined;
            }
          },
        );

        return item;
      });

      // 6. 提交导入
      const res = await importWorkOrders(
        mappedItems as unknown as Record<string, unknown>[],
      );

      // 7. 结果反馈
      if (res.successCount > 0) {
        const failTip = res.failedCount ? `，失败${res.failedCount}条` : '';
        message.success(
          t('qms.common.importSuccessCount', { count: res.successCount }) +
            failTip,
        );
        onSuccess();
      } else {
        const failReason = res.errors?.[0]?.message || '';
        message.error(
          t('qms.common.importFailed') + (failReason ? `：${failReason}` : ''),
        );
      }
    } catch (error: unknown) {
      console.error('Import Error:', error);
      message.error(
        t('qms.common.importFailed') +
          ((error as { message?: string }).message
            ? `: ${(error as { message?: string }).message}`
            : ''),
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
