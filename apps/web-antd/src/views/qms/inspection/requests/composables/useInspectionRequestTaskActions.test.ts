import { ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestTaskActions } from './useInspectionRequestTaskActions';

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
      defectSubtypes: ref({}),
      deptRawData: ref([]),
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
    composable.linkedIssueDraft.value.ncNumber = 'NC-2026-001';
    composable.linkedIssueDraft.value.description = 'Weld pore';
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
          responsibleDepartment: 'Assembly Team A',
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
      team: 'Supplier A',
      workOrderNumber: 'WO-1',
    } as any);

    expect(composable.linkedIssueDraft.value).toMatchObject({
      responsibleDepartment: '采购部',
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
      team: 'Outsourcing Plant A',
      workOrderNumber: 'WO-1',
    } as any);

    expect(composable.linkedIssueDraft.value).toMatchObject({
      responsibleDepartment: '生产 OBU',
      supplierName: 'Outsourcing Plant A',
    });
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
    composable.linkedIssueDraft.value.description = 'Weld pore';
    composable.linkedIssueDraft.value.rootCause = 'Parameter drift';
    composable.linkedIssueDraft.value.solution = 'Rework and inspect again';

    await composable.submitClose();

    expect(mockCloseInspectionRequest).not.toHaveBeenCalled();
    expect(mockMessageWarning).toHaveBeenCalledWith('不合格项照片不能为空');
  });
});
