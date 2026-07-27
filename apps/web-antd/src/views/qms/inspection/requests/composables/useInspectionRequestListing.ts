import type { InspectionRequest, InspectionRequestStatus } from '@qgs/shared';

import { reactive, ref } from 'vue';

import {
  getInspectionRequests,
  getInspectionRequestStats,
} from '#/api/qms/inspection-request';

import { INCOMING_INSPECTION_PROCESS_NAME } from '../constants';

interface InspectionRequestStatsState {
  byInspector: Array<{
    count: number;
    inspector: string;
    inspectorId: null | string;
  }>;
  byTeam: Array<{ count: number; team: string; teamId: null | string }>;
  historyByInspector: Array<{
    averageTaskMinutes: number;
    completedTaskCount: number;
    inspector: string;
    inspectorId: null | string;
  }>;
  historyByTeam: Array<{
    count: number;
    team: string;
    teamId: null | string;
  }>;
  inspectorStatus: Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
    inspectorId: string;
    status: 'BUSY' | 'IDLE';
  }>;
  pendingDispatchCount: number;
  pendingInspectionCount: number;
  todayClosedCount: number;
  todaySubmittedCount: number;
}

interface UseInspectionRequestListingOptions {
  onRequestsLoaded?: () => void;
}

export function useInspectionRequestListing(
  options: UseInspectionRequestListingOptions = {},
) {
  const { onRequestsLoaded } = options;

  const loading = ref(false);
  const requests = ref<InspectionRequest[]>([]);
  const requestStats = ref<InspectionRequestStatsState>({
    byInspector: [],
    byTeam: [],
    historyByInspector: [],
    historyByTeam: [],
    inspectorStatus: [],
    pendingDispatchCount: 0,
    pendingInspectionCount: 0,
    todayClosedCount: 0,
    todaySubmittedCount: 0,
  });

  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const activeView = ref('current');

  const query = reactive({
    keyword: '',
    status: undefined as InspectionRequestStatus | undefined,
  });

  function applyViewStatus(value: string) {
    switch (value) {
      case 'dispatched': {
        query.status = 'DISPATCHED';
        break;
      }
      case 'inspecting': {
        query.status = undefined;
        break;
      }
      case 'submitted': {
        query.status = 'SUBMITTED';
        break;
      }
      default: {
        query.status = undefined;
      }
    }
  }

  function shouldUseMineFilter() {
    return activeView.value === 'inspecting';
  }

  function requestProcessNameFilter() {
    return activeView.value === 'incoming'
      ? INCOMING_INSPECTION_PROCESS_NAME
      : undefined;
  }

  async function loadRequests() {
    loading.value = true;
    try {
      const res = await getInspectionRequests({
        current: !query.status,
        includeClosed: shouldUseMineFilter(),
        keyword: query.keyword || undefined,
        mine: shouldUseMineFilter(),
        page: page.value,
        pageSize: pageSize.value,
        processName: requestProcessNameFilter(),
        status: query.status,
      });
      requests.value = res.items || [];
      total.value = res.total || 0;
      onRequestsLoaded?.();
    } finally {
      loading.value = false;
    }
  }

  async function loadRequestStats() {
    requestStats.value = await getInspectionRequestStats();
  }

  async function loadInspectorActiveTasks(inspectorId: string) {
    if (!inspectorId) return { items: [], total: 0 };
    return getInspectionRequests({
      inspectorId,
      page: 1,
      pageSize: 100,
      status: 'DISPATCHED,INSPECTING',
    });
  }

  async function refreshInspectionRequestPage() {
    page.value = 1;
    await Promise.all([loadRequests(), loadRequestStats()]);
  }

  async function handleViewChange(
    value: number | string,
    beforeReload?: () => void,
  ) {
    activeView.value = String(value);
    beforeReload?.();
    applyViewStatus(activeView.value);
    page.value = 1;
    await loadRequests();
  }

  async function handleStatusFilterChange() {
    switch (query.status) {
      case 'DISPATCHED': {
        activeView.value = 'dispatched';
        break;
      }
      case 'SUBMITTED': {
        activeView.value = 'submitted';
        break;
      }
      default: {
        activeView.value = 'current';
      }
    }
    page.value = 1;
    await loadRequests();
  }

  return {
    activeView,
    loading,
    page,
    pageSize,
    query,
    requestStats,
    requests,
    total,
    handleStatusFilterChange,
    handleViewChange,
    loadRequestStats,
    loadRequests,
    loadInspectorActiveTasks,
    refreshInspectionRequestPage,
  };
}
