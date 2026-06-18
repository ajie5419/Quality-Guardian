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

  it('submits linked issue photos from upload response URLs when closing as failed', async () => {
    const composable = createComposable();

    composable.openClose({
      id: 'request-1',
      componentName: 'Bearing',
      inspectionId: 'inspection-1',
      inspectorName: 'Inspector A',
      partName: 'Bearing',
      processName: 'Welding',
      quantity: 2,
      workOrderNumber: 'WO-1',
    } as any);
    composable.closeForm.result = 'FAIL';
    composable.closeForm.attachments = [
      { name: 'inspection.pdf', url: '/api/uploads/inspection.pdf' },
    ];
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
          quantity: 2,
        }),
        result: 'FAIL',
        unqualifiedQuantity: 2,
      }),
    );
    expect(mockMessageSuccess).toHaveBeenCalledWith('报检任务检验完成');
  });
});
