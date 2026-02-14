import type { InspectionIssue } from '../types';

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
  function createIssue(id: string): InspectionIssue {
    return {
      id,
      ncNumber: `NC-${id}`,
      reportDate: '2026-01-01',
      workOrderNumber: 'WO-1',
      projectName: 'Project',
      partName: 'Part',
      description: 'desc',
      quantity: 1,
      lossAmount: 0,
      responsibleDepartment: 'D1',
      status: 'Open',
      claim: 'No',
      photos: [],
      severity: 'Major',
      inspector: 'Inspector',
    };
  }

  function createComposable() {
    const checkedRows = ref<InspectionIssue[]>([]);
    const gridApi = { reload: vi.fn() };
    const onAfterDeleteSuccess = vi.fn();
    const invalidateInspectionIssues = vi.fn();

    return {
      checkedRows,
      gridApi,
      onAfterDeleteSuccess,
      invalidateInspectionIssues,
      ...useIssueActions({
        checkedRows,
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
    composable.checkedRows.value = [createIssue('a'), createIssue('b')];

    composable.handleBatchDelete();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBatchDeleteInspectionIssues).toHaveBeenCalledWith(['a', 'b']);
    expect(composable.invalidateInspectionIssues).toHaveBeenCalled();
    expect(composable.gridApi.reload).toHaveBeenCalled();
    expect(composable.onAfterDeleteSuccess).toHaveBeenCalled();
  });
});
