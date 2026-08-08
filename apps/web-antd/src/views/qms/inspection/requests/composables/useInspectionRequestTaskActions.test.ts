import { ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveDivisionIdentity,
  useInspectionRequestTaskActions,
} from './useInspectionRequestTaskActions';

const {
  mockCloseInspectionRequest,
  mockDeleteInspectionRequest,
  mockDispatchInspectionRequest,
  mockGetInspectionRequest,
  mockMessageError,
  mockMessageSuccess,
  mockMessageWarning,
} = vi.hoisted(() => ({
  mockCloseInspectionRequest: vi.fn(),
  mockDeleteInspectionRequest: vi.fn(),
  mockDispatchInspectionRequest: vi.fn(),
  mockGetInspectionRequest: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageWarning: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  closeInspectionRequest: mockCloseInspectionRequest,
  deleteInspectionRequest: mockDeleteInspectionRequest,
  dispatchInspectionRequest: mockDispatchInspectionRequest,
  getInspectionRequest: mockGetInspectionRequest,
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: mockMessageError,
    success: mockMessageSuccess,
    warning: mockMessageWarning,
  },
  Modal: {
    confirm: ({ onOk }: { onOk?: () => Promise<void> | void }) => onOk?.(),
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockCloseInspectionRequest.mockResolvedValue({ id: 'request-1' });
  mockDispatchInspectionRequest.mockResolvedValue({ id: 'request-1' });
});

describe('useInspectionRequestTaskActions', () => {
  function createComposable() {
    return useInspectionRequestTaskActions({
      buildRequestUrl: (params) => JSON.stringify(params),
      canDelete: ref(true),
      canDispatch: ref(true),
      canApproveMaterial: ref(true),
      deptTreeData: ref([
        {
          children: [
            { title: 'Assembly Team A', value: 'dept-assembly' },
            { title: '采购部', value: 'dept-purchase' },
            { title: '生产 OBU', value: 'dept-production' },
          ],
          title: 'Company',
          value: 'company',
        },
      ]),
      getCurrentUserName: () => 'Inspector A',
      handleApiError: vi.fn(),
      makeQr: vi.fn().mockResolvedValue('qr'),
      onAfterMutation: vi.fn().mockResolvedValue(undefined),
      query: { keyword: '' },
      route: { query: {} } as any,
      router: { replace: vi.fn() } as any,
    });
  }

  it('submits a new dispatch request with the dispatch success message', async () => {
    const composable = createComposable();

    composable.openDispatch({
      id: 'request-1',
      inspectorId: '',
      partName: 'Bearing',
      priority: 3,
      status: 'SUBMITTED',
    } as any);
    composable.dispatchForm.inspectorId = 'inspector-1';

    await composable.submitDispatch();

    expect(mockDispatchInspectionRequest).toHaveBeenCalledWith('request-1', {
      dispatchRemark: '',
      inspectorId: 'inspector-1',
      priority: 3,
    });
    expect(mockMessageSuccess).toHaveBeenCalledWith('报检任务已派单');
  });

  it('submits a reassignment with the reassign success message', async () => {
    const composable = createComposable();

    composable.openDispatch({
      id: 'request-1',
      inspectorId: 'old-inspector',
      partName: 'Bearing',
      priority: 2,
      status: 'DISPATCHED',
    } as any);
    composable.dispatchForm.inspectorId = 'new-inspector';

    await composable.submitDispatch();

    expect(mockDispatchInspectionRequest).toHaveBeenCalledWith('request-1', {
      dispatchRemark: '',
      inspectorId: 'new-inspector',
      priority: 2,
    });
    expect(mockMessageSuccess).toHaveBeenCalledWith('报检任务已改派');
  });

  it('opens pending material approval in the dispatch workflow', () => {
    const composable = createComposable();

    composable.openDispatch({
      dispatchBlockedReason: 'MATERIAL_APPROVAL_PENDING',
      id: 'request-1',
      materialRequestId: 'material-request-1',
      partName: 'New bearing',
      priority: 3,
      status: 'SUBMITTED',
    } as any);

    expect(composable.dispatchOpen.value).toBe(true);
    expect(mockMessageWarning).not.toHaveBeenCalled();
  });

  it('submits linked issue photos from upload response URLs when closing as failed', async () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: 'Bearing',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: 'Welding',
      quantity: 2,
      team: 'Assembly Team A',
      workOrderNumber: 'WO-1',
    } as any);
    composable.closeForm.result = 'FAIL';
    composable.linkedIssueDraft.value.defectCategoryId = 'category-1';
    composable.linkedIssueDraft.value.defectSubcategoryId = 'subcategory-1';
    composable.linkedIssueDraft.value.ncNumber = 'NC-2026-001';
    composable.linkedIssueDraft.value.description = 'Weld pore';
    composable.linkedIssueDraft.value.division = 'Vehicle OBU';
    composable.linkedIssueDraft.value.divisionId = 'dept-vehicle';
    composable.linkedIssueDraft.value.rootCause = 'Parameter drift';
    composable.linkedIssueDraft.value.solution = 'Rework and inspect again';
    composable.linkedIssueDraft.value.photos = [
      {
        name: 'defect.jpg',
        response: {
          data: {
            url: '/api/uploads/defect.jpg',
          },
        },
        status: 'done',
        uid: 'photo-1',
      },
    ] as any;

    await composable.submitClose();

    expect(mockCloseInspectionRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        linkedIssue: expect.objectContaining({
          photos: ['/api/uploads/defect.jpg'],
          ncNumber: 'NC-2026-001',
          quantity: 2,
          division: 'Vehicle OBU',
          divisionId: 'dept-vehicle',
          responsibleDepartment: 'Assembly Team A',
          responsibleDepartmentId: 'dept-assembly',
          responsibilityType: 'INTERNAL_DEPARTMENT',
        }),
        attachments: [],
        hasDocuments: false,
        result: 'FAIL',
        unqualifiedQuantity: 2,
      }),
    );
    expect(mockMessageSuccess).toHaveBeenCalledWith('报检任务检验完成');
  });

  it('prefills incoming supplier as supplierName and purchasing as responsible department', () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: '',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: '进货检验',
      quantity: 2,
      supplierId: 'supplier-1',
      team: 'Supplier A',
      workOrderNumber: 'WO-1',
    } as any);

    expect(composable.linkedIssueDraft.value).toMatchObject({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchase',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('prefills incoming responsibility for INCOMING category with a configured process name', () => {
    const composable = createComposable();

    composable.openClose({
      category: 'INCOMING',
      id: 'request-1',
      componentName: '',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: '外购件',
      quantity: 2,
      supplierId: 'supplier-1',
      team: 'Supplier A',
      workOrderNumber: 'WO-1',
    } as any);

    expect(composable.linkedIssueDraft.value).toMatchObject({
      responsibilityType: 'SUPPLIER',
      responsibleDepartment: '采购部',
      responsibleDepartmentId: 'dept-purchase',
      supplierId: 'supplier-1',
      supplierName: 'Supplier A',
    });
  });

  it('prefills outsourcing unit as supplierName and production OBU as responsible department', () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: 'Bearing',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: '外协机加',
      quantity: 2,
      supplierId: 'supplier-outsourcing-1',
      team: 'Outsourcing Plant A',
      workOrderNumber: 'WO-1',
    } as any);

    expect(composable.linkedIssueDraft.value).toMatchObject({
      responsibilityType: 'OUTSOURCING_UNIT',
      responsibleDepartment: '生产 OBU',
      responsibleDepartmentId: 'dept-production',
      supplierId: 'supplier-outsourcing-1',
      supplierName: 'Outsourcing Plant A',
    });
  });

  it('submits the canonical TEAM supplier responsibility returned by the API', async () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: 'Bearing',
      inspectorName: 'Inspector A',
      issueResponsibility: {
        responsibilityType: 'OUTSOURCING_UNIT',
        responsibleDepartment: '生产 OBU',
        supplierId: 'supplier-team-1',
        supplierName: 'Mapped Outsourcing Plant',
      },
      partName: 'Bearing',
      processName: 'Machining',
      quantity: 2,
      team: 'Mapped Outsourcing Plant',
      teamId: 'team-external-1',
      workOrderNumber: 'WO-1',
    } as any);
    composable.closeForm.result = 'FAIL';
    composable.linkedIssueDraft.value.defectCategoryId = 'category-1';
    composable.linkedIssueDraft.value.defectSubcategoryId = 'subcategory-1';
    composable.linkedIssueDraft.value.description = 'Surface scratch';
    composable.linkedIssueDraft.value.rootCause = 'Fixture contact';
    composable.linkedIssueDraft.value.solution = 'Rework and protect fixture';
    composable.linkedIssueDraft.value.photos = [
      {
        name: 'defect.jpg',
        response: { data: { url: '/api/uploads/defect.jpg' } },
        status: 'done',
        uid: 'photo-1',
      },
    ] as any;

    await composable.submitClose();

    expect(mockCloseInspectionRequest).toHaveBeenCalledWith(
      'request-1',
      expect.objectContaining({
        linkedIssue: expect.objectContaining({
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartment: '生产 OBU',
          responsibleDepartmentId: 'dept-production',
          supplierId: 'supplier-team-1',
          supplierName: 'Mapped Outsourcing Plant',
        }),
      }),
    );
  });

  it('requires issue photos when closing as failed', async () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: 'Bearing',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: 'Welding',
      quantity: 2,
      team: 'Assembly Team A',
      workOrderNumber: 'WO-1',
    } as any);
    composable.closeForm.result = 'FAIL';
    composable.linkedIssueDraft.value.defectCategoryId = 'category-1';
    composable.linkedIssueDraft.value.defectSubcategoryId = 'subcategory-1';
    composable.linkedIssueDraft.value.description = 'Weld pore';
    composable.linkedIssueDraft.value.rootCause = 'Parameter drift';
    composable.linkedIssueDraft.value.solution = 'Rework and inspect again';

    await composable.submitClose();

    expect(mockCloseInspectionRequest).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith('不合格项照片不能为空');
  });
});

describe('resolveDivisionIdentity', () => {
  const departments = [
    {
      value: 'group-1',
      title: 'Operations',
      children: [
        {
          value: 'dept-vehicle',
          title: 'Vehicle OBU',
        },
      ],
    },
  ];

  it('uses divisionId as the canonical department identity', () => {
    expect(
      resolveDivisionIdentity(departments, {
        division: 'Legacy Division',
        divisionId: 'dept-vehicle',
      }),
    ).toEqual({
      division: 'Vehicle OBU',
      divisionId: 'dept-vehicle',
    });
  });

  it('converts a legacy division ID into ID and name fields', () => {
    expect(
      resolveDivisionIdentity(departments, {
        division: 'dept-vehicle',
      }),
    ).toEqual({
      division: 'Vehicle OBU',
      divisionId: 'dept-vehicle',
    });
  });

  it('resolves TreeSelect nodes used by the close inspection modal', () => {
    expect(
      resolveDivisionIdentity(
        [
          {
            title: 'Vehicle OBU',
            value: 'dept-vehicle',
          },
        ],
        {
          division: 'dept-vehicle',
        },
      ),
    ).toEqual({
      division: 'Vehicle OBU',
      divisionId: 'dept-vehicle',
    });
  });

  it('converts a legacy division name into ID and name fields', () => {
    expect(
      resolveDivisionIdentity(departments, {
        division: 'Vehicle OBU',
      }),
    ).toEqual({
      division: 'Vehicle OBU',
      divisionId: 'dept-vehicle',
    });
  });
});
