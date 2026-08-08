import { nextTick, reactive, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestIdentityOptions } from './useInspectionRequestIdentityOptions';

const { getPublicInspectionRequestSuppliers, getPublicInspectionRequestTeams } =
  vi.hoisted(() => ({
    getPublicInspectionRequestSuppliers: vi.fn(),
    getPublicInspectionRequestTeams: vi.fn(),
  }));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestSuppliers,
  getPublicInspectionRequestTeams,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('inspection request identity options', () => {
  it('loads outsourcing suppliers when the selected process is configured as outsourcing', async () => {
    const requestForm = {
      incomingType: 'proc-machined',
      supplierId: '',
      team: '',
      teamId: '',
    };
    const composable = useInspectionRequestIdentityOptions({
      isIncomingEntry: ref(true),
      processOptions: ref([
        {
          processName: '机加成品件',
          supplierSource: 'Outsourcing',
          value: 'proc-machined',
        },
      ]),
      requestForm,
    });
    getPublicInspectionRequestSuppliers.mockResolvedValue([]);

    await composable.loadResponsibleUnitOptions();

    expect(getPublicInspectionRequestSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Outsourcing' }),
    );
  });

  it('loads regular suppliers when the selected process is not configured as outsourcing', async () => {
    const requestForm = {
      incomingType: 'proc-raw',
      supplierId: '',
      team: '',
      teamId: '',
    };
    const composable = useInspectionRequestIdentityOptions({
      isIncomingEntry: ref(true),
      processOptions: ref([
        {
          processName: '原材料',
          supplierSource: null,
          value: 'proc-raw',
        },
      ]),
      requestForm,
    });
    getPublicInspectionRequestSuppliers.mockResolvedValue([]);

    await composable.loadResponsibleUnitOptions();

    expect(getPublicInspectionRequestSuppliers).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'Supplier' }),
    );
  });

  it('reloads the supplier category when the incoming type changes', async () => {
    const requestForm = reactive({
      incomingType: '',
      supplierId: '',
      team: '',
      teamId: '',
    });
    useInspectionRequestIdentityOptions({
      isIncomingEntry: ref(true),
      processOptions: ref([
        {
          processName: '机加成品件',
          supplierSource: 'Outsourcing',
          value: 'proc-machined',
        },
      ]),
      requestForm,
    });
    getPublicInspectionRequestSuppliers.mockResolvedValue([]);

    requestForm.incomingType = 'proc-machined';
    await nextTick();

    await vi.waitFor(() => {
      expect(getPublicInspectionRequestSuppliers).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Outsourcing' }),
      );
    });
  });
});
