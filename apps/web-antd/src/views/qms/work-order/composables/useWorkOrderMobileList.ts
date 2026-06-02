import type { Ref } from 'vue';

import type { QmsWorkOrderApi } from '#/api/qms/work-order';
import type { SystemDeptApi } from '#/api/system/dept';

import { ref } from 'vue';

import { findNameById } from '#/types';

interface WorkOrderGridApiLike {
  reload: () => void;
  setGridOptions: (options: {
    pagerConfig: { currentPage: number; pageSize: number };
  }) => void;
}

export function useWorkOrderMobileList(options: {
  deptRawData: Ref<SystemDeptApi.Dept[]>;
  gridApi: () => undefined | WorkOrderGridApiLike;
}) {
  const mobileRecords = ref<QmsWorkOrderApi.WorkOrderItem[]>([]);
  const mobileTotal = ref(0);
  const mobilePage = ref(1);
  const mobilePageSize = ref(20);

  function formatMobileWorkOrder(row: QmsWorkOrderApi.WorkOrderItem) {
    return {
      ...row,
      division:
        findNameById(options.deptRawData.value, row.division || '') ||
        row.division ||
        '-',
    };
  }

  function syncMobileRows(payload: {
    items: QmsWorkOrderApi.WorkOrderItem[];
    total: number;
  }) {
    mobileRecords.value = payload.items.map((item) =>
      formatMobileWorkOrder(item),
    );
    mobileTotal.value = payload.total;
  }

  function resetMobilePage() {
    mobilePage.value = 1;
  }

  function handleMobilePageChange(nextPage: number, nextPageSize: number) {
    mobilePage.value = nextPage;
    mobilePageSize.value = nextPageSize;
    const api = options.gridApi();
    if (!api) return;
    api.setGridOptions({
      pagerConfig: {
        currentPage: nextPage,
        pageSize: nextPageSize,
      },
    });
    api.reload();
  }

  return {
    handleMobilePageChange,
    mobilePage,
    mobilePageSize,
    mobileRecords,
    mobileTotal,
    resetMobilePage,
    syncMobileRows,
  };
}
