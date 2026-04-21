import type {
  WorkOrderRequirementBoardFilter,
  WorkOrderRequirementOverview,
} from '#/api/qms/work-order';

import { ref } from 'vue';

import {
  getWorkOrderRequirementBoard,
  getWorkOrderRequirementOverview,
} from '#/api/qms/work-order';

type QueryParams = {
  endDate?: string;
  granularity?: 'month' | 'week' | 'year';
  ignoreYearFilter?: boolean;
  keyword?: string;
  page?: number;
  pageSize?: number;
  productName?: string;
  projectName?: string;
  startDate?: string;
  status?: string;
  workOrderNumber?: string;
  year?: number;
};

export function useWorkOrderRequirementBoard(
  getQueryParams: () => QueryParams,
  handleApiError: (error: unknown, context: string) => void,
) {
  const boardVisible = ref(false);
  const boardLoading = ref(false);
  const boardFilter = ref<WorkOrderRequirementBoardFilter>('all');
  const boardItems = ref<
    Array<{
      attachments: Array<{
        name?: string;
        thumbUrl?: string;
        type?: string;
        url: string;
      }>;
      confirmedAt?: null | string;
      confirmer: string;
      confirmStatus: 'CONFIRMED' | 'PENDING';
      createdAt: string;
      customerName: string;
      division: string;
      id: string;
      partName: string;
      processName: string;
      projectName: string;
      requirementName: string;
      responsiblePerson: string;
      responsibleTeam: string;
      workOrderNumber: string;
      workOrderStatus: string;
    }>
  >([]);
  const boardPagination = ref({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const overview = ref<WorkOrderRequirementOverview>({
    confirmedRequirements: 0,
    overdueUnconfirmedRequirements: 0,
    pendingRequirements: 0,
    plannedRequirements: 0,
  });

  async function loadOverview(queryParams = getQueryParams()) {
    try {
      overview.value = await getWorkOrderRequirementOverview(queryParams);
    } catch (error) {
      handleApiError(error, 'Load Work Order Requirement Overview');
    }
  }

  async function loadBoard(
    filter = boardFilter.value,
    page = boardPagination.value.current,
    pageSize = boardPagination.value.pageSize,
    queryParams = getQueryParams(),
  ) {
    boardLoading.value = true;
    boardFilter.value = filter;
    try {
      const result = await getWorkOrderRequirementBoard({
        ...queryParams,
        filter,
        page,
        pageSize,
      });
      boardItems.value = result.items || [];
      boardPagination.value = {
        current: page,
        pageSize,
        total: Number(result.total || 0),
      };
    } catch (error) {
      handleApiError(error, 'Load Work Order Requirement Board');
    } finally {
      boardLoading.value = false;
    }
  }

  async function openBoard(filter: WorkOrderRequirementBoardFilter) {
    boardVisible.value = true;
    await loadBoard(filter, 1, boardPagination.value.pageSize);
  }

  function closeBoard() {
    boardVisible.value = false;
  }

  return {
    boardFilter,
    boardItems,
    boardLoading,
    boardPagination,
    boardVisible,
    closeBoard,
    loadBoard,
    loadOverview,
    openBoard,
    overview,
  };
}
