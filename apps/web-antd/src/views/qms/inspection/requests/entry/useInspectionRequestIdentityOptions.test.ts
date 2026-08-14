import { reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestIdentityOptions } from './useInspectionRequestIdentityOptions';

const { getPublicInspectionRequestResponsibilityOptions } = vi.hoisted(() => ({
  getPublicInspectionRequestResponsibilityOptions: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestResponsibilityOptions,
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

  it('does not retain a hidden client department for outsourcing', async () => {
    const requestForm = createForm();
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: '生产 OBU', value: 'dept-production' }],
      responsibilityType: 'OUTSOURCING_UNIT',
      suppliers: [{ label: 'Outsource A', value: 'supplier-a' }],
    });
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.changeResponsibilityType('OUTSOURCING_UNIT');

    expect(requestForm).toMatchObject({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartmentId: '',
      supplierId: '',
    });
    expect(composable.supplierOptions.value).toEqual([
      { label: 'Outsource A', value: 'supplier-a' },
    ]);
  });

  it('keeps supplier responsibility free of client department defaults', async () => {
    const requestForm = createForm();
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: '采购部', value: 'dept-purchasing' }],
      responsibilityType: 'SUPPLIER',
      suppliers: [{ label: 'Supplier A', value: 'supplier-a' }],
    });
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.changeResponsibilityType('SUPPLIER');

    expect(requestForm.responsibleDepartmentId).toBe('');
  });

  it('leaves the department unselected when production OBU is ambiguous', async () => {
    const requestForm = createForm();
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [
        { label: '生产 OBU', value: 'dept-production-a' },
        { label: '生产 OBU', value: 'dept-production-b' },
      ],
      responsibilityType: 'OUTSOURCING_UNIT',
      suppliers: [{ label: 'Outsource A', value: 'supplier-a' }],
    });
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.changeResponsibilityType('OUTSOURCING_UNIT');

    expect(requestForm.responsibleDepartmentId).toBe('');
  });

  it('keeps a same-type manual department when options cannot load', async () => {
    const requestForm = createForm();
    requestForm.responsibilityType = 'SUPPLIER';
    requestForm.responsibleDepartmentId = 'dept-manual';
    requestForm.supplierId = 'supplier-manual';
    getPublicInspectionRequestResponsibilityOptions.mockRejectedValue(
      new Error('Network unavailable'),
    );
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();

    expect(requestForm).toMatchObject({
      responsibleDepartmentId: 'dept-manual',
      supplierId: 'supplier-manual',
    });
    expect(composable.responsibilityDepartmentOptions.value).toEqual([]);
  });

  it.each([['SUPPLIER', 'dept-incoming', 'supplier-incoming']] as const)(
    'clears a stale %s department when a complete options reload no longer contains it',
    async (responsibilityType, departmentId, supplierId) => {
      const requestForm = createForm();
      requestForm.responsibilityType = responsibilityType;
      requestForm.responsibleDepartmentId = 'dept-stale';
      requestForm.supplierId = supplierId;
      getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
        departments: [{ label: 'Current department', value: departmentId }],
        responsibilityType,
        suppliers: [{ label: 'Current supplier', value: supplierId }],
      });
      const composable = useInspectionRequestIdentityOptions({ requestForm });

      await composable.loadResponsibilityOptions();

      expect(requestForm).toMatchObject({
        responsibleDepartmentId: '',
        supplierId,
      });
      expect(composable.responsibilityDepartmentOptions.value).toEqual([
        { label: 'Current department', value: departmentId },
      ]);
    },
  );

  it('clears an external department while searching suppliers', async () => {
    const requestForm = createForm();
    requestForm.responsibilityType = 'SUPPLIER';
    requestForm.responsibleDepartmentId = 'dept-structure';
    requestForm.supplierId = 'supplier-a';
    getPublicInspectionRequestResponsibilityOptions.mockResolvedValue({
      departments: [{ label: 'Purchasing', value: 'dept-purchasing' }],
      responsibilityType: 'SUPPLIER',
      suppliers: [{ label: 'Supplier A', value: 'supplier-a' }],
    });
    const composable = useInspectionRequestIdentityOptions({ requestForm });
    composable.responsibilityDepartmentOptions.value = [
      { label: 'Structure BU', value: 'dept-structure' },
    ];

    await composable.loadResponsibilityOptions('supplier a');

    expect(requestForm).toMatchObject({
      responsibleDepartmentId: '',
      supplierId: 'supplier-a',
    });
    expect(composable.responsibilityDepartmentOptions.value).toEqual([
      { label: 'Structure BU', value: 'dept-structure' },
      { label: 'Purchasing', value: 'dept-purchasing' },
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
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();

    expect(requestForm).toMatchObject({
      responsibleDepartmentId: '',
      supplierId: '',
    });
  });

  it('keeps the selected department while searching other departments', async () => {
    const requestForm = createForm();
    getPublicInspectionRequestResponsibilityOptions
      .mockResolvedValueOnce({
        departments: [{ label: 'Structure BU', value: 'dept-structure' }],
        responsibilityType: 'INTERNAL_DEPARTMENT',
        suppliers: [],
      })
      .mockResolvedValueOnce({
        departments: [{ label: 'Machining BU', value: 'dept-machining' }],
        responsibilityType: 'INTERNAL_DEPARTMENT',
        suppliers: [],
      });
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();
    requestForm.responsibleDepartmentId = 'dept-structure';

    await composable.loadResponsibilityOptions('machining');

    expect(requestForm).toMatchObject({
      responsibleDepartmentId: 'dept-structure',
    });
    expect(composable.responsibilityDepartmentOptions.value).toEqual([
      { label: 'Structure BU', value: 'dept-structure' },
      { label: 'Machining BU', value: 'dept-machining' },
    ]);
  });
});
