import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useIssueActions } from './useIssueActions';

const {
  mockBatchDeleteInspectionIssues,
  mockDeleteInspectionIssue,
  mockHandleApiError,
  mockMessageSuccess,
  mockMessageWarning,
} = vi.hoisted(() => ({
  mockBatchDeleteInspectionIssues: vi.fn(),
  mockDeleteInspectionIssue: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageWarning: vi.fn(),
}));

vi.mock('#/api/qms/inspection', () => ({
  batchDeleteInspectionIssues: mockBatchDeleteInspectionIssues,
  deleteInspectionIssue: mockDeleteInspectionIssue,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('#/hooks/useKnowledgeSettlement', () => ({
  useKnowledgeSettlement: () => ({ settle: vi.fn() }),
}));

vi.mock('ant-design-vue', () => ({
  Modal: {
    confirm: ({ onOk }: { onOk?: () => Promise<void> | void }) => onOk?.(),
  },
  message: {
    success: mockMessageSuccess,
    warning: mockMessageWarning,
  },
}));

describe('useIssueActions', () => {
  function createComposable() {
    const checkedRows = ref<any[]>([]);
    const gridApi = { reload: vi.fn() };
    const onAfterDeleteSuccess = vi.fn();
    const invalidateInspectionIssues = vi.fn();

    return {
      checkedRows,
      gridApi,
      onAfterDeleteSuccess,
      invalidateInspectionIssues,
      ...useIssueActions({
        checkedRows: checkedRows as any,
        gridApi,
        invalidateInspectionIssues,
        onAfterDeleteSuccess,
        t: (key: string) => key,
      }),
    };
  }

  it('warns when batch delete is triggered with no selected rows', () => {
    const composable = createComposable();
    composable.handleBatchDelete();
    expect(mockMessageWarning).toHaveBeenCalledWith('common.pleaseSelectData');
  });

  it('batch deletes selected rows and triggers refresh callbacks', async () => {
    mockBatchDeleteInspectionIssues.mockResolvedValueOnce({ successCount: 2 });
    const composable = createComposable();
    composable.checkedRows.value = [{ id: 'a' }, { id: 'b' }];

    composable.handleBatchDelete();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBatchDeleteInspectionIssues).toHaveBeenCalledWith(['a', 'b']);
    expect(composable.invalidateInspectionIssues).toHaveBeenCalled();
    expect(composable.gridApi.reload).toHaveBeenCalled();
    expect(composable.onAfterDeleteSuccess).toHaveBeenCalled();
  });
});
