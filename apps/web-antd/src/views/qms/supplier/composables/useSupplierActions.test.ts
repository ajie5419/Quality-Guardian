import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import type { QmsSupplierApi } from '#/api/qms/supplier';

import { useSupplierActions } from './useSupplierActions';

const {
  mockBatchDeleteSuppliers,
  mockDeleteSupplier,
  mockImportSuppliers,
  mockHandleApiError,
  mockMessageSuccess,
  mockMessageWarning,
  mockMessageError,
  mockMapRowsByColumnTitles,
  mockReadImportRowsFromFile,
} = vi.hoisted(() => ({
  mockBatchDeleteSuppliers: vi.fn(),
  mockDeleteSupplier: vi.fn(),
  mockImportSuppliers: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageWarning: vi.fn(),
  mockMessageError: vi.fn(),
  mockMapRowsByColumnTitles: vi.fn(),
  mockReadImportRowsFromFile: vi.fn(),
}));

vi.mock('#/api/qms/supplier', () => ({
  batchDeleteSuppliers: mockBatchDeleteSuppliers,
  deleteSupplier: mockDeleteSupplier,
  importSuppliers: mockImportSuppliers,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('#/utils/import-sheet', () => ({
  mapRowsByColumnTitles: mockMapRowsByColumnTitles,
  readImportRowsFromFile: mockReadImportRowsFromFile,
}));

vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: ({ onOk }: { onOk?: () => Promise<void> | void }) => onOk?.(),
  },
  message: {
    error: mockMessageError,
    success: mockMessageSuccess,
    warning: mockMessageWarning,
  },
}));

vi.mock('@vben/locales', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('useSupplierActions', () => {
  function createComposable() {
    const checkedRows = ref<QmsSupplierApi.SupplierItem[]>([]);
    const gridApi = {
      value: {
        grid: {
          getColumns: () => [{ field: 'name', title: 'name' }],
        },
        reload: vi.fn(),
      },
    };

    return {
      checkedRows,
      gridApi,
      ...useSupplierActions({
        category: 'Supplier',
        checkedRows,
        detailDrawerRef: ref({ open: vi.fn() }),
        editModalRef: ref({ open: vi.fn() }),
        gridApi,
      }),
    };
  }

  it('imports and reports partial failures with warning message', async () => {
    mockImportSuppliers.mockResolvedValueOnce({
      errorCount: 1,
      errors: [{ reason: 'name required', row: 2 }],
      successCount: 2,
      totalCount: 3,
    });
    mockReadImportRowsFromFile.mockResolvedValueOnce([{ name: 'A' }]);
    mockMapRowsByColumnTitles.mockReturnValueOnce([{ name: 'A' }]);

    const file = new File(['name\nA'], 'supplier.csv', { type: 'text/csv' });
    const composable = createComposable();
    await composable.handleCustomImport({ file });

    expect(mockMessageSuccess).toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalled();
  });

  it('batch deletes selected rows and clears checked list', async () => {
    mockBatchDeleteSuppliers.mockResolvedValueOnce({});

    const composable = createComposable();
    composable.checkedRows.value = [
      { id: '1' },
      { id: '2' },
    ] as unknown as QmsSupplierApi.SupplierItem[];

    composable.handleBatchDelete();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBatchDeleteSuppliers).toHaveBeenCalledWith(['1', '2']);
    expect(composable.checkedRows.value).toEqual([]);
  });
});
