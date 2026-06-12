import { describe, expect, it, vi } from 'vitest';

import { useDeadlineBoard } from './useDeadlineBoard';

const { mockGetSupervisionDeadlineBoard, mockMessageError } = vi.hoisted(
  () => ({
    mockGetSupervisionDeadlineBoard: vi.fn(),
    mockMessageError: vi.fn(),
  }),
);

vi.mock('#/api/qms/supervision', () => ({
  getSupervisionDeadlineBoard: mockGetSupervisionDeadlineBoard,
}));

vi.mock('ant-design-vue', () => ({
  message: { error: mockMessageError },
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual };
});

describe('useDeadlineBoard', () => {
  it('initializes with empty board and loading false', () => {
    const { board, loading } = useDeadlineBoard();
    expect(loading.value).toBe(false);
    expect(board.value).toEqual({
      byProject: [],
      delayed: [],
      dueSoon: [],
      risk: [],
      summary: {
        delayedCount: 0,
        dueSoonCount: 0,
        healthyPercent: 100,
        riskCount: 0,
        totalProjects: 0,
      },
    });
  });

  it('loadBoard fetches data and updates board', async () => {
    const mockData = {
      byProject: [{ id: 'p1' }],
      delayed: [],
      dueSoon: [],
      risk: [],
      summary: {
        delayedCount: 1,
        dueSoonCount: 0,
        healthyPercent: 90,
        riskCount: 0,
        totalProjects: 5,
      },
    };
    mockGetSupervisionDeadlineBoard.mockResolvedValueOnce(mockData);

    const { loadBoard, board, loading } = useDeadlineBoard();
    const promise = loadBoard({ dueSoonDays: 7 });

    expect(loading.value).toBe(true);

    await promise;

    expect(loading.value).toBe(false);
    expect(board.value).toEqual(mockData);
    expect(mockGetSupervisionDeadlineBoard).toHaveBeenCalledWith({
      dueSoonDays: 7,
    });
  });

  it('loadBoard shows error message on failure', async () => {
    mockGetSupervisionDeadlineBoard.mockRejectedValueOnce(new Error('fail'));

    const { loadBoard, loading } = useDeadlineBoard();
    await loadBoard();

    expect(loading.value).toBe(false);
    expect(mockMessageError).toHaveBeenCalledWith('加载纳期看板失败');
  });

  it('loadBoard calls API with undefined params by default', async () => {
    mockGetSupervisionDeadlineBoard.mockResolvedValueOnce({
      byProject: [],
      delayed: [],
      dueSoon: [],
      risk: [],
      summary: {
        delayedCount: 0,
        dueSoonCount: 0,
        healthyPercent: 100,
        riskCount: 0,
        totalProjects: 0,
      },
    });

    const { loadBoard } = useDeadlineBoard();
    await loadBoard();

    expect(mockGetSupervisionDeadlineBoard).toHaveBeenCalledWith(undefined);
  });
});
