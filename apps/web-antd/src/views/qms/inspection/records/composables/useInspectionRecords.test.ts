import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRecords } from './useInspectionRecords';

const {
  mockCreateInspectionRecord,
  mockUpdateInspectionRecord,
  mockHandleApiError,
  mockMessageSuccess,
  mockMessageError,
  mockMessageWarning,
} = vi.hoisted(() => ({
  mockCreateInspectionRecord: vi.fn(),
  mockHandleApiError: vi.fn(),
  mockMessageError: vi.fn(),
  mockMessageSuccess: vi.fn(),
  mockMessageWarning: vi.fn(),
  mockUpdateInspectionRecord: vi.fn(),
}));

vi.mock('#/hooks/useAvailableYears', () => ({
  useAvailableYears: () => ({
    years: { value: [] as number[] },
    loading: { value: false },
    refreshYears: vi.fn(),
  }),
}));

vi.mock('#/api/qms/inspection', () => ({
  createInspectionRecord: mockCreateInspectionRecord,
  updateInspectionRecord: mockUpdateInspectionRecord,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: mockMessageError,
    success: mockMessageSuccess,
    warning: mockMessageWarning,
  },
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue');
  return { ...actual };
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useInspectionRecords', () => {
  it('initializes with correct defaults', () => {
    const {
      activeKey,
      currentYear,
      yearOptions,
      modalVisible,
      isEdit,
      currentRecord,
    } = useInspectionRecords();

    expect(activeKey.value).toBe('incoming');
    expect(currentYear.value).toBe(new Date().getFullYear());
    // 年份选项来自动态接口（useAvailableYears），初始为空，onMounted 后填充
    expect(yearOptions.value).toEqual([]);
    expect(modalVisible.value).toBe(false);
    expect(isEdit.value).toBe(false);
    expect(currentRecord.value).toBeUndefined();
  });

  it('openModal without record sets isEdit false and opens modal', () => {
    const { openModal, isEdit, modalVisible, currentRecord } =
      useInspectionRecords();

    openModal();

    expect(isEdit.value).toBe(false);
    expect(modalVisible.value).toBe(true);
    expect(currentRecord.value).toBeUndefined();
  });

  it('openModal with record sets isEdit true and stores record', () => {
    const { openModal, isEdit, modalVisible, currentRecord } =
      useInspectionRecords();
    const record = { id: 'r1', name: 'test' } as any;

    openModal(record);

    expect(isEdit.value).toBe(true);
    expect(modalVisible.value).toBe(true);
    expect(currentRecord.value).toStrictEqual(record);
  });

  it('handleSubmit returns early when formRef is null', async () => {
    const { handleSubmit } = useInspectionRecords();
    await handleSubmit();
    expect(mockCreateInspectionRecord).not.toHaveBeenCalled();
  });

  it('handleSubmit creates record and shows success', async () => {
    mockCreateInspectionRecord.mockResolvedValueOnce({ id: 'new-1' });
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({
        linkedIssue: {},
        materialName: 'Part A',
      }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockCreateInspectionRecord).toHaveBeenCalled();
    expect(mockMessageSuccess).toHaveBeenCalledWith('保存成功');
  });

  it('handleSubmit updates record when in edit mode', async () => {
    mockUpdateInspectionRecord.mockResolvedValueOnce({ id: 'existing-1' });
    const { handleSubmit, formRef, openModal } = useInspectionRecords();

    openModal({ id: 'existing-1' } as any);

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({ linkedIssue: {} }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockUpdateInspectionRecord).toHaveBeenCalledWith('existing-1', {
      category: 'INCOMING',
      linkedIssue: {},
    });
  });

  it('submits an enabled linked issue with the inspection record transaction', async () => {
    mockCreateInspectionRecord.mockResolvedValueOnce({ id: 'rec-1' });
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({
        inspector: 'John',
        inspectionDate: '2026-01-01',
        linkedIssue: {
          defectType: '焊缝缺陷',
          enabled: true,
          lossAmount: 500,
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchasing',
        },
        materialName: 'Steel',
        processName: '焊接',
        projectName: 'Proj',
        quantity: 10,
        supplierId: 'supplier-1',
        supplierName: 'Supplier A',
        team: '质量部',
      }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockCreateInspectionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'INCOMING',
        linkedIssue: expect.objectContaining({
          defectType: '焊缝缺陷',
          enabled: true,
          responsibilityType: 'SUPPLIER',
          responsibleDepartmentId: 'dept-purchasing',
        }),
      }),
    );
  });

  it('does not create a second linked issue request after the record is saved', async () => {
    mockCreateInspectionRecord.mockResolvedValueOnce({
      id: 'rec-process-1',
      supplierId: 'supplier-team-1',
      supplierName: 'Resident Team Supplier',
    });
    const { activeKey, handleSubmit, formRef } = useInspectionRecords();
    activeKey.value = 'process';

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({
        linkedIssue: {
          description: 'Process defect',
          enabled: true,
          responsibilityType: 'OUTSOURCING_UNIT',
          responsibleDepartmentId: 'dept-production',
          supplierId: 'stale-supplier',
          supplierName: 'Stale Supplier',
        },
        supplierId: 'stale-form-supplier',
        supplierName: 'Stale Form Supplier',
        team: 'Resident Team A',
      }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockCreateInspectionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        linkedIssue: expect.objectContaining({
          supplierId: 'stale-supplier',
          responsibilityType: 'OUTSOURCING_UNIT',
        }),
      }),
    );
  });

  it('passes internal linked issue responsibility through to the record request', async () => {
    mockCreateInspectionRecord.mockResolvedValueOnce({
      id: 'rec-internal-1',
      supplierId: 'supplier-should-not-write',
    });
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({
        linkedIssue: {
          enabled: true,
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-quality',
        },
      }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockCreateInspectionRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        linkedIssue: expect.objectContaining({
          responsibilityType: 'INTERNAL_DEPARTMENT',
          responsibleDepartmentId: 'dept-quality',
        }),
      }),
    );
  });

  it('surfaces an atomic record creation failure without reporting partial success', async () => {
    mockCreateInspectionRecord.mockRejectedValueOnce(new Error('issue fail'));
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({
        linkedIssue: { enabled: true },
      }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    expect(mockMessageError).toHaveBeenCalledWith('issue fail');
    expect(mockMessageSuccess).not.toHaveBeenCalledWith('保存成功');
  });

  it('handleSubmit shows error on validation failure', async () => {
    const error = new Error('Validation failed');
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn(),
      validate: vi.fn().mockRejectedValue(error),
    };

    await handleSubmit();

    expect(mockMessageError).toHaveBeenCalledWith('Validation failed');
  });

  it('handleSubmit handles string errors', async () => {
    const { handleSubmit, formRef } = useInspectionRecords();

    formRef.value = {
      getValues: vi.fn(),
      validate: vi.fn().mockRejectedValue('some string error'),
    };

    await handleSubmit();

    expect(mockMessageError).toHaveBeenCalledWith('some string error');
  });

  it('handleSubmit defaults category from activeKey', async () => {
    mockCreateInspectionRecord.mockResolvedValueOnce({ id: 'rec-3' });
    const { handleSubmit, formRef, activeKey } = useInspectionRecords();
    activeKey.value = 'finished';

    formRef.value = {
      getValues: vi.fn().mockResolvedValue({ linkedIssue: {} }),
      validate: vi.fn().mockResolvedValue(undefined),
    };

    await handleSubmit();

    const callArgs = mockCreateInspectionRecord.mock.calls[0]?.[0];
    expect(callArgs?.category).toBe('FINISHED');
  });
});
