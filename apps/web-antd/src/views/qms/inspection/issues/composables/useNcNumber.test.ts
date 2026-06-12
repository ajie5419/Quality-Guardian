import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useNcNumber } from './useNcNumber';

const { mockGenerateInspectionNcNumber, mockHandleApiError } = vi.hoisted(
  () => ({
    mockGenerateInspectionNcNumber: vi.fn(),
    mockHandleApiError: vi.fn(),
  }),
);

vi.mock('#/api/qms/inspection', () => ({
  generateInspectionNcNumber: mockGenerateInspectionNcNumber,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: mockHandleApiError }),
}));

describe('useNcNumber', () => {
  function createComposable() {
    const formApi = { setFieldValue: vi.fn() };
    const isEditMode = ref(false);
    return {
      formApi,
      isEditMode,
      ...useNcNumber({ formApi, isEditMode }),
    };
  }

  it('generates NC number and returns it', async () => {
    mockGenerateInspectionNcNumber.mockResolvedValueOnce({
      ncNumber: 'NC-2026-001',
    });
    const { generateNcNumber } = createComposable();
    const result = await generateNcNumber();
    expect(result).toBe('NC-2026-001');
    expect(mockGenerateInspectionNcNumber).toHaveBeenCalled();
  });

  it('calls handleApiError and rethrows on failure', async () => {
    const error = new Error('network');
    mockGenerateInspectionNcNumber.mockRejectedValueOnce(error);
    const { generateNcNumber } = createComposable();
    await expect(generateNcNumber()).rejects.toThrow('network');
    expect(mockHandleApiError).toHaveBeenCalledWith(
      error,
      'Generate NC Number',
    );
  });

  it('isAutoNc starts as false', () => {
    const { isAutoNc } = createComposable();
    expect(isAutoNc.value).toBe(false);
  });

  it('resetAutoNc sets isAutoNc to false', () => {
    const { isAutoNc, resetAutoNc } = createComposable();
    isAutoNc.value = true;
    resetAutoNc();
    expect(isAutoNc.value).toBe(false);
  });
});
