import type { VxeTableDefines } from 'vxe-table';

import type { Ref } from 'vue';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';

interface ImportOptions<T = Record<string, any>> {
  /** Grid API instance ref */
  gridApi: Ref<ReturnType<typeof useVbenVxeGrid>[1] | undefined>;
  /** Import API function */
  importApi: (items: T[]) => Promise<{ successCount: number }>;
  /** Optional status mapping */
  statusMap?: Record<string, string>;
  /** Optional field mapping for aliases (field -> possible headers) */
  fieldMap?: Record<string, string[]>;
  /** Optional callback on success */
  onSuccess?: () => void;
  /** Maximum rows allowed */
  maxRows?: number;
}

export function useGridImport<T = Record<string, any>>(
  options: ImportOptions<T>,
) {
  const { t } = useI18n();
  const loading = ref(false);

  const handleImport = async ({ file }: { file: File }) => {
    if (loading.value) return;
    loading.value = true;

    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      let workbook = XLSX.read(arrayBuffer, {
        type: 'array',
        cellDates: true,
      });

      // Special handling for CSV encoding issues (common in Chinese environments)
      if (file.name.endsWith('.csv')) {
        const firstSheetName = workbook.SheetNames[0];
        if (firstSheetName) {
          const firstSheet = workbook.Sheets[firstSheetName];
          const firstKey = firstSheet ? Object.keys(firstSheet)[0] : null;
          const firstCell =
            firstSheet && firstKey ? firstSheet[firstKey] : null;

          // If the first cell content looks like mangled UTF-8 (interpreted as Latin-1)
          if (
            firstCell &&
            typeof firstCell.v === 'string' &&
            /[\u0080-\u00FF]/.test(firstCell.v)
          ) {
            workbook = XLSX.read(arrayBuffer, {
              type: 'array',
              cellDates: true,
              codepage: 65_001, // UTF-8
            });
          }
        }
      }

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return;
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return;
      const results = XLSX.utils.sheet_to_json(worksheet) as Record<
        string,
        unknown
      >[];

      if (results.length === 0) {
        message.warning(t('common.noData'));
        return;
      }

      if (options.maxRows && results.length > options.maxRows) {
        message.warning(t('qms.common.fileTooLarge', { max: options.maxRows }));
        return;
      }

      const columns = options.gridApi.value?.grid.getColumns();
      if (!columns) return;
      const mappedItems = results.map((row) => {
        const item: Record<string, unknown> = {};
        columns.forEach((c: VxeTableDefines.ColumnInfo) => {
          if (!c.field || !c.title) return;

          // 1. Try to find key in fieldMap (aliases)
          let excelKey = options.fieldMap?.[c.field]
            ? Object.keys(row).find((k) =>
                options.fieldMap?.[c.field]?.some(
                  (alias) =>
                    String(alias).replaceAll(/\s+/g, '').toLowerCase() ===
                      String(k).replaceAll(/\s+/g, '').toLowerCase() ||
                    t(alias).replaceAll(/\s+/g, '').toLowerCase() ===
                      String(k).replaceAll(/\s+/g, '').toLowerCase(),
                ),
              )
            : undefined;

          // 2. Fallback to column title mapping
          if (!excelKey) {
            excelKey = Object.keys(row).find(
              (k) =>
                String(k).replaceAll(/\s+/g, '').toLowerCase() ===
                  String(c.title).replaceAll(/\s+/g, '').toLowerCase() ||
                t(String(c.title)).replaceAll(/\s+/g, '').toLowerCase() ===
                  String(k).replaceAll(/\s+/g, '').toLowerCase(),
            );
          }

          if (excelKey) {
            let val = row[excelKey];

            // Normalize Date
            if (val instanceof Date) {
              const y = val.getFullYear();
              const m = String(val.getMonth() + 1).padStart(2, '0');
              const d = String(val.getDate()).padStart(2, '0');
              val = `${y}-${m}-${d}`;
            }

            // Normalize Status if map provided
            if (
              options.statusMap &&
              c.field === 'status' &&
              typeof val === 'string'
            ) {
              val = options.statusMap[val] || val;
            }

            item[c.field] = val;
          }
        });
        return item as T;
      });

      const res = await options.importApi(mappedItems);

      if (res.successCount > 0) {
        message.success(
          t('common.importSuccessCount', { count: res.successCount }),
        );
        options.gridApi.value?.reload();
        options.onSuccess?.();
      }
    } catch (error) {
      console.error('Import Error:', error);
      message.error(t('common.importFailed'));
    } finally {
      loading.value = false;
    }
  };

  return {
    handleImport,
    loading,
  };
}
