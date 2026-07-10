import type { InspectionIssue } from '../types';

import { ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createIssue(id: string, createdBy = 'user-1'): InspectionIssue {
    return {
      createdBy,
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
        canManageIssue: (row) => row.createdBy === 'user-1',
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

  it('blocks editing an issue created by another user', () => {
    const composable = createComposable();

    composable.handleEdit(createIssue('other', 'user-2'));

    expect(composable.modalVisible.value).toBe(false);
    expect(mockMessageWarning).toHaveBeenCalledWith(
      'qms.inspection.issues.ownerOnly',
    );
  });

  it('blocks deleting an issue created by another user', async () => {
    const composable = createComposable();

    await composable.handleDelete(createIssue('other', 'user-2'));

    expect(mockDeleteInspectionIssue).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith(
      'qms.inspection.issues.ownerOnly',
    );
  });

  it('blocks batch deletion when the selection contains another owner', () => {
    const composable = createComposable();
    composable.checkedRows.value = [
      createIssue('own'),
      createIssue('other', 'user-2'),
    ];

    composable.handleBatchDelete();

    expect(mockBatchDeleteInspectionIssues).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith(
      'qms.inspection.issues.ownerOnly',
    );
  });
});
