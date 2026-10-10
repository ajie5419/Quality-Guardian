import { ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkOrderActions } from './useWorkOrderActions';

vi.mock('@vben/locales', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('ant-design-vue', () => ({
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  Modal: { confirm: vi.fn() },
}));

vi.mock('#/api/qms/work-order', () => ({
  batchDeleteWorkOrders: vi.fn(),
  deleteWorkOrder: vi.fn(),
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

vi.mock('#/hooks/useQmsQueries', () => ({
  useInvalidateQmsQueries: () => ({ invalidateWorkOrders: vi.fn() }),
}));

describe('useWorkOrderActions.handleEdit', () => {
  const open = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    open.mockReset();
  });

  /**
   * OPTIMISTIC-LOCK-001 regression: the row copy handed to the editor must
   * keep `version`, otherwise the PUT omits the lock token and the backend
   * rejects every interactive work-order edit with 400.
   */
  it('carries the optimistic-lock version into the edit record', () => {
    const actions = useWorkOrderActions({
      checkedRows: ref([]),
      deptTreeData: ref([]),
      editModalRef: ref({ open }) as any,
      gridApi: ref(undefined),
    });

    actions.handleEdit({
      customerName: 'E2E Customer',
      deliveryDate: '2030-01-01',
      division: 'E2E Production',
      effectiveTime: null,
      id: 'WO-1',
      multiStationEnabled: false,
      projectName: 'E2E Project',
      quantity: 7,
      status: 'OPEN',
      version: 4,
      workOrderNumber: 'WO-1',
    } as any);

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0]?.[0]?.record).toMatchObject({
      version: 4,
      workOrderNumber: 'WO-1',
    });
  });
});
