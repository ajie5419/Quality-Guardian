import { ref } from 'vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { importWorkOrders } from '#/api/qms/work-order';
import { useGridImport } from '#/hooks/useGridImport';

import { IMPORT_STATUS_MAP, WORK_ORDER_FIELD_MAP } from '../constants';

export function useWorkOrderImport(onSuccess: () => void) {
  // Use the common grid import logic but with specific configuration
  // Note: we'll pass the gridApi manually from the component
  const gridApi = ref<ReturnType<typeof useVbenVxeGrid>[1]>();

  const { handleImport, loading } = useGridImport({
    gridApi,
    importApi: importWorkOrders,
    statusMap: IMPORT_STATUS_MAP,
    fieldMap: WORK_ORDER_FIELD_MAP,
    onSuccess,
    maxRows: 10_000,
  });

  return {
    handleImport,
    loading,
    gridApi, // Expose to allow component to set it
  };
}
