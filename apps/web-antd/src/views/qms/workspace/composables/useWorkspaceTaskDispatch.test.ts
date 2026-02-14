import { describe, expect, it, vi } from 'vitest';

import type { QmsTaskDispatchApi } from '#/api/qms/task-dispatch';

import { useWorkspaceTaskDispatch } from './useWorkspaceTaskDispatch';

const {
  mockGetTaskStats,
  mockGetTaskList,
  mockCreateTask,
  mockUpdateTaskStatus,
  mockGetUserList,
  mockGetItpList,
  mockGetDfmeaItemsByProject,
  mockMessageWarning,
  mockMessageSuccess,
} = vi.hoisted(() => ({
  mockGetTaskStats: vi.fn(),
  mockGetTaskList: vi.fn(),
  mockCreateTask: vi.fn(),
  mockUpdateTaskStatus: vi.fn(),
  mockGetUserList: vi.fn(),
  mockGetItpList: vi.fn(),
  mockGetDfmeaItemsByProject: vi.fn(),
  mockMessageWarning: vi.fn(),
  mockMessageSuccess: vi.fn(),
}));

vi.mock('#/api/qms/task-dispatch', () => ({
  createTask: mockCreateTask,
  getTaskList: mockGetTaskList,
  getTaskStats: mockGetTaskStats,
  updateTaskStatus: mockUpdateTaskStatus,
}));

vi.mock('#/api/system/user', () => ({
  getUserList: mockGetUserList,
}));

vi.mock('#/api/qms/planning', () => ({
  getDfmeaItemsByProject: mockGetDfmeaItemsByProject,
  getItpList: mockGetItpList,
}));

vi.mock('ant-design-vue', () => ({
  message: {
    success: mockMessageSuccess,
    warning: mockMessageWarning,
  },
}));

describe('useWorkspaceTaskDispatch', () => {
  function createTask(
    partial: Partial<QmsTaskDispatchApi.TaskDispatch>,
  ): QmsTaskDispatchApi.TaskDispatch {
    return {
      assigneeId: 'u-1',
      assignorId: 'u-admin',
      createdAt: '',
      id: 'task-default',
      level: 1,
      priority: 1,
      status: 'PENDING',
      title: 'task',
      type: 'ITP_INSPECTION',
      updatedAt: '',
      ...partial,
    };
  }

  function createComposable() {
    return useWorkspaceTaskDispatch({
      t: (key: string) => key,
      userRoles: ['admin'],
      handleApiError: vi.fn(),
    });
  }

  it('loads task stats and task list for admin role', async () => {
    mockGetTaskStats.mockResolvedValueOnce({
      overdue: 0,
      pendingLevel1: 1,
      pendingLevel2: 2,
      processing: 3,
    });
    mockGetTaskList.mockResolvedValueOnce([{ id: 't-1', title: 'task-1' }]);

    const composable = createComposable();
    await composable.loadTaskData();

    expect(mockGetTaskList).toHaveBeenCalledWith({
      all: 'true',
      status: 'PENDING,DISPATCHED',
    });
    expect(composable.taskStats.value.pendingLevel1).toBe(1);
    expect(composable.myTasks.value).toHaveLength(1);
  });

  it('warns and blocks submit when required dispatch fields are missing', async () => {
    const composable = createComposable();
    composable.currentTask.value = createTask({
      id: 'task-2',
      title: 'dispatch-me',
      type: 'ITP_INSPECTION',
    });

    await composable.submitSecondaryDispatch();

    expect(mockCreateTask).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith(
      'common.pleaseCompleteInfo',
    );
  });

  it('completes parent task when selected items cover all business items', async () => {
    mockCreateTask.mockResolvedValueOnce({ id: 'sub-1' });
    mockUpdateTaskStatus.mockResolvedValueOnce({});
    mockGetTaskStats.mockResolvedValue({
      overdue: 0,
      pendingLevel1: 0,
      pendingLevel2: 0,
      processing: 0,
    });
    mockGetTaskList.mockResolvedValue([]);

    const composable = createComposable();
    composable.currentTask.value = createTask({
      id: 'task-3',
      title: 'parent-task',
      type: 'ITP_INSPECTION',
    });
    composable.dispatchForm.value = {
      assigneeId: 'u-1',
      selectedItems: ['A', 'B'],
    };
    composable.businessItems.value = [
      { id: '1', label: 'A' },
      { id: '2', label: 'B' },
    ];

    await composable.submitSecondaryDispatch();

    expect(mockCreateTask).toHaveBeenCalled();
    expect(mockUpdateTaskStatus).toHaveBeenCalledWith('task-3', 'COMPLETED');
    expect(mockMessageSuccess).toHaveBeenCalledWith(
      'qms.workspace.allDispatched',
    );
  });
});
