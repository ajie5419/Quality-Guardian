import type {
  InspectionRequest,
  InspectionRequestStatus,
} from '#/api/qms/inspection-request';

import { computed, reactive, ref } from 'vue';

import {
  getInspectionRequests,
  getInspectionRequestStats,
} from '#/api/qms/inspection-request';

interface InspectionRequestStatsState {
  byInspector: Array<{ count: number; inspector: string }>;
  byTeam: Array<{ count: number; team: string }>;
  historyByInspector: Array<{
    averageTaskMinutes: number;
    completedTaskCount: number;
    inspector: string;
  }>;
  historyByTeam: Array<{ count: number; team: string }>;
  inspectorStatus: Array<{
    activeTaskCount: number;
    averageTaskMinutes: number;
    completedTaskCount: number;
    currentTaskMinutes: number;
    inspector: string;
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

  const isEntryView = computed(() => activeView.value === 'entry');

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

  async function refreshInspectionRequestPage() {
    if (isEntryView.value) return;
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
    if (isEntryView.value) return;
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
    isEntryView,
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
    refreshInspectionRequestPage,
  };
}
