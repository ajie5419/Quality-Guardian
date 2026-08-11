import { reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestIdentityOptions } from './useInspectionRequestIdentityOptions';

const {
  getPublicInspectionRequestResponsibilityOptions,
  getPublicInspectionRequestTeams,
} = vi.hoisted(() => ({
  getPublicInspectionRequestResponsibilityOptions: vi.fn(),
  getPublicInspectionRequestTeams: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestResponsibilityOptions,
  getPublicInspectionRequestTeams,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function createForm() {
  return reactive({
    responsibilityType: 'INTERNAL_DEPARTMENT' as
      | 'INTERNAL_DEPARTMENT'
      | 'OUTSOURCING_UNIT'
      | 'SUPPLIER',
    responsibleDepartmentId: '',
    supplierId: '',
    team: '',
    teamId: '',
  });
}

describe('inspection request responsibility options', () => {
  it('keeps internal responsibility supplier-free and selects a canonical department ID', async () => {
    const requestForm = createForm();
    requestForm.supplierId = 'supplier-stale';
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: 'Assembly Department', value: 'dept-assembly' }],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      suppliers: [],
    });
    getPublicInspectionRequestTeams.mockResolvedValue([]);
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();

    expect(
      getPublicInspectionRequestResponsibilityOptions,
    ).toHaveBeenCalledWith({
      keyword: undefined,
      responsibilityType: 'INTERNAL_DEPARTMENT',
    });
    expect(composable.responsibilityDepartmentOptions.value).toEqual([
      { label: 'Assembly Department', value: 'dept-assembly' },
    ]);
    expect(requestForm.supplierId).toBe('');
  });

  it('locks the server policy department and only retains supplier ID for outsourcing', async () => {
    const requestForm = createForm();
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: 'Production OBU', value: 'dept-production' }],
      responsibilityType: 'OUTSOURCING_UNIT',
      suppliers: [{ label: 'Outsource A', value: 'supplier-a' }],
    });
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.changeResponsibilityType('OUTSOURCING_UNIT');

    expect(requestForm).toMatchObject({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: 'dept-production',
      supplierId: '',
      team: '',
      teamId: '',
    });
    expect(composable.supplierOptions.value).toEqual([
      { label: 'Outsource A', value: 'supplier-a' },
    ]);
  });

  it('clears an internal department ID no longer returned by the server', async () => {
    const requestForm = createForm();
    requestForm.responsibleDepartmentId = 'dept-assembly';
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: 'Purchasing', value: 'dept-purchasing' }],
      responsibilityType: 'INTERNAL_DEPARTMENT',
      suppliers: [],
    });
    getPublicInspectionRequestTeams.mockResolvedValue([]);
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();

    expect(requestForm).toMatchObject({
      responsibleDepartmentId: '',
      supplierId: '',
      team: '',
      teamId: '',
    });
  });
});
