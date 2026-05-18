import type { DeadlineBoardResult } from '@qgs/shared';

import { ref } from 'vue';

import { message } from 'ant-design-vue';

import { requestClient } from '#/api/request';

export function useDeadlineBoard() {
  const loading = ref(false);
  const board = ref<DeadlineBoardResult>({
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

  async function loadBoard(params?: {
    dueSoonDays?: number;
    projectId?: string;
  }) {
    loading.value = true;
    try {
      const data = await requestClient.get<DeadlineBoardResult>(
        '/qms/supervision/deadline-board',
        { params },
      );
      board.value = data;
    } catch {
      message.error('加载纳期看板失败');
    } finally {
      loading.value = false;
    }
  }

  return { board, loadBoard, loading };
}
