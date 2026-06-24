import type { InspectionRequest } from '#/api/qms/inspection-request';

import { ref } from 'vue';

interface InspectorStatusTaskLoaderOptions {
  handleApiError: (error: unknown, action?: string) => void;
  loadInspectorActiveTasks: (
    inspectorId: string,
  ) => Promise<{ items: InspectionRequest[]; total: number }>;
  warn: (content: string) => void;
}

export function useInspectionRequestInspectorTasks(
  options: InspectorStatusTaskLoaderOptions,
) {
  const inspectorStatusTaskLoading = ref(false);
  const inspectorStatusTasks = ref<InspectionRequest[]>([]);

  async function loadInspectorStatusTasks(item: {
    inspectorId: string;
    inspector: string;
  }) {
    if (!item.inspectorId) {
      inspectorStatusTasks.value = [];
      options.warn('该检验员缺少账号标识，无法查询当前任务');
      return;
    }
    inspectorStatusTaskLoading.value = true;
    try {
      const result = await options.loadInspectorActiveTasks(item.inspectorId);
      inspectorStatusTasks.value = result.items || [];
    } catch (error) {
      options.handleApiError(error, `Load Inspector Tasks ${item.inspector}`);
    } finally {
      inspectorStatusTaskLoading.value = false;
    }
  }

  return {
    inspectorStatusTaskLoading,
    inspectorStatusTasks,
    loadInspectorStatusTasks,
  };
}
