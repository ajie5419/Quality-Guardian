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

  it('loads outsourcing canonical department and supplier choices without preselecting either', async () => {
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
      responsibleDepartmentId: '',
      supplierId: '',
      team: '',
      teamId: '',
    });
    expect(composable.supplierOptions.value).toEqual([
      { label: 'Outsource A', value: 'supplier-a' },
    ]);
  });

  it.each([
    ['SUPPLIER', 'dept-incoming', 'supplier-incoming'],
    ['OUTSOURCING_UNIT', 'dept-outsourcing', 'supplier-outsourcing'],
  ] as const)(
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
        team: '',
        teamId: '',
      });
      expect(composable.responsibilityDepartmentOptions.value).toEqual([
        { label: 'Current department', value: departmentId },
      ]);
    },
  );

  it('retains an external department while searching suppliers', async () => {
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
      responsibleDepartmentId: 'dept-structure',
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

  it('keeps the selected department and execution team while searching other departments', async () => {
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
    getPublicInspectionRequestTeams.mockResolvedValue([
      {
        group: 'internal',
        label: 'Structure Team',
        responsibleDepartmentId: 'dept-structure',
        value: 'team-structure',
      },
    ]);
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadResponsibilityOptions();
    requestForm.responsibleDepartmentId = 'dept-structure';
    requestForm.teamId = 'team-structure';
    requestForm.team = 'Structure Team';
    getPublicInspectionRequestTeams.mockClear();

    await composable.loadResponsibilityOptions('machining');

    expect(getPublicInspectionRequestTeams).not.toHaveBeenCalled();
    expect(requestForm).toMatchObject({
      responsibleDepartmentId: 'dept-structure',
      team: 'Structure Team',
      teamId: 'team-structure',
    });
    expect(composable.responsibilityDepartmentOptions.value).toEqual([
      { label: 'Structure BU', value: 'dept-structure' },
      { label: 'Machining BU', value: 'dept-machining' },
    ]);
  });

  it('searches execution TEAMs without reloading or clearing the selected department', async () => {
    const requestForm = createForm();
    requestForm.responsibleDepartmentId = 'dept-structure';
    getPublicInspectionRequestTeams.mockResolvedValue([
      {
        group: 'internal',
        label: 'Structure Team',
        responsibleDepartmentId: 'dept-structure',
        value: 'team-structure',
      },
    ]);
    const composable = useInspectionRequestIdentityOptions({ requestForm });

    await composable.loadInternalTeamOptions('structure team');

    expect(
      getPublicInspectionRequestResponsibilityOptions,
    ).not.toHaveBeenCalled();
    expect(getPublicInspectionRequestTeams).toHaveBeenCalledWith({
      keyword: 'structure team',
    });
    expect(requestForm.responsibleDepartmentId).toBe('dept-structure');
    expect(composable.internalTeamOptions.value).toEqual([
      {
        group: 'internal',
        label: 'Structure Team',
        responsibleDepartmentId: 'dept-structure',
        value: 'team-structure',
      },
    ]);
  });
});
