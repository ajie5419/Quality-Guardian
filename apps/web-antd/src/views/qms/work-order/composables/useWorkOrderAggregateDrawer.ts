import type { WorkspaceWorkOrderAggregateResponse } from '#/api/qms/workspace';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getWorkspaceWorkOrderAggregate } from '#/api/qms/workspace';
import { getDeptList } from '#/api/system/dept';
import { findNameById } from '#/types';

export function useWorkOrderAggregateDrawer(
  handleApiError: (error: unknown, context: string) => void,
) {
  const router = useRouter();
  const route = useRoute();
  const aggregateVisible = ref(false);
  const aggregateLoading = ref(false);
  const selectedWorkOrderNumber = ref('');
  const aggregateData = ref<null | WorkspaceWorkOrderAggregateResponse>(null);
  const deptRawData = ref<SystemDeptApi.Dept[]>([]);

  const divisionLabel = computed(() =>
    getDivisionLabel(
      deptRawData.value,
      aggregateData.value?.workOrder.division,
    ),
  );

  async function ensureDepartmentsLoaded() {
    if (deptRawData.value.length > 0) return;
    try {
      deptRawData.value = await getDeptList();
    } catch (error) {
      handleApiError(error, 'Load Work Order Departments');
    }
  }

  async function openWorkOrderAggregate(workOrderNumber: string) {
    const normalized = String(workOrderNumber || '').trim();
    if (!normalized) return;
    await ensureDepartmentsLoaded();
    aggregateLoading.value = true;
    aggregateVisible.value = true;
    selectedWorkOrderNumber.value = normalized;
    try {
      aggregateData.value = await getWorkspaceWorkOrderAggregate({
        workOrderNumber: normalized,
      });
      if (String(route.query.workOrderNumber || '').trim() !== normalized) {
        await router.replace({
          query: {
            ...route.query,
            workOrderNumber: normalized,
          },
        });
      }
    } catch (error) {
      aggregateVisible.value = false;
      aggregateData.value = null;
      handleApiError(error, 'Load Work Order Aggregate');
    } finally {
      aggregateLoading.value = false;
    }
  }

  async function closeWorkOrderAggregate() {
    const nextQuery = { ...route.query };
    Reflect.deleteProperty(nextQuery, 'workOrderNumber');
    if (Reflect.has(route.query, 'workOrderNumber')) {
      await router.replace({ query: nextQuery });
    }
    aggregateVisible.value = false;
    aggregateData.value = null;
    selectedWorkOrderNumber.value = '';
  }

  async function refreshAggregate() {
    if (!selectedWorkOrderNumber.value) return;
    await openWorkOrderAggregate(selectedWorkOrderNumber.value);
  }

  return {
    aggregateData,
    aggregateLoading,
    aggregateVisible,
    closeWorkOrderAggregate,
    divisionLabel,
    openWorkOrderAggregate,
    refreshAggregate,
    selectedWorkOrderNumber,
  };
}

function getDivisionLabel(departments: SystemDeptApi.Dept[], value?: string) {
  const idOrName = String(value || '').trim();
  if (!idOrName) return '-';
  return findNameById(departments, idOrName) || idOrName;
}
