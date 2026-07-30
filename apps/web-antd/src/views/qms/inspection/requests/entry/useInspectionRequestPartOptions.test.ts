import { effectScope, ref } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInspectionRequestPartOptions } from './useInspectionRequestPartOptions';

const { getBomParts, getPartOptions } = vi.hoisted(() => ({
  getBomParts: vi.fn(),
  getPartOptions: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestBomParts: getBomParts,
  getPublicInspectionRequestPartOptions: getPartOptions,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('inspection request part options', () => {
  it('does not call the public search endpoint for an empty keyword', () => {
    const scope = effectScope();
    scope.run(() => {
      const result = useInspectionRequestPartOptions({
        handleApiError: vi.fn(),
        isIncomingEntry: ref(true),
        requestForm: { partId: '', partName: '', workOrderNumbers: [] },
        showError: vi.fn(),
      });

      result.searchCanonicalPartOptions('   ');
      expect(getPartOptions).not.toHaveBeenCalled();
    });
    scope.stop();
  });

  it('debounces remote search and prefers BOM labels for duplicate IDs', async () => {
    vi.useFakeTimers();
    getPartOptions.mockResolvedValue([{ id: 'part-1', name: 'Frame' }]);
    getBomParts.mockResolvedValue([
      {
        id: 'bom-1',
        partId: 'part-1',
        partName: 'Frame',
        workOrderNumber: 'WO-1',
      },
    ]);
    const scope = effectScope();
    const requestForm = {
      partId: '',
      partName: '',
      workOrderNumbers: ['WO-1'],
    };
    const result = scope.run(() =>
      useInspectionRequestPartOptions({
        handleApiError: vi.fn(),
        isIncomingEntry: ref(true),
        requestForm,
        showError: vi.fn(),
      }),
    );
    expect(result).toBeDefined();
    if (!result) return;

    result.searchCanonicalPartOptions('Fra');
    result.searchCanonicalPartOptions('Frame');
    await vi.advanceTimersByTimeAsync(300);
    await result.loadBomPartOptions(['WO-1']);

    expect(getPartOptions).toHaveBeenCalledTimes(1);
    expect(getPartOptions).toHaveBeenCalledWith({ keyword: 'Frame' });
    expect(result.partOptions.value).toEqual([
      { label: 'BOM · Frame', partName: 'Frame', value: 'part-1' },
    ]);
    scope.stop();
  });

  it('does not let an obsolete BOM failure clear the latest options', async () => {
    let rejectObsoleteRequest: (error: Error) => void = () => {};
    getBomParts
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectObsoleteRequest = reject;
          }),
      )
      .mockResolvedValueOnce([
        {
          id: 'bom-2',
          partId: 'part-2',
          partName: 'Bracket',
          workOrderNumber: 'WO-2',
        },
      ]);
    const requestForm = {
      partId: '',
      partName: '',
      workOrderNumbers: ['WO-1'],
    };
    const showError = vi.fn();
    const scope = effectScope();
    const result = scope.run(() =>
      useInspectionRequestPartOptions({
        handleApiError: vi.fn(),
        isIncomingEntry: ref(true),
        requestForm,
        showError,
      }),
    );
    expect(result).toBeDefined();
    if (!result) return;

    const obsoleteRequest = result.loadBomPartOptions(['WO-1']);
    requestForm.workOrderNumbers = ['WO-2'];
    await result.loadBomPartOptions(['WO-2']);
    rejectObsoleteRequest(new Error('obsolete failure'));
    await obsoleteRequest;

    expect(result.partOptions.value).toEqual([
      { label: 'BOM · Bracket', partName: 'Bracket', value: 'part-2' },
    ]);
    expect(showError).not.toHaveBeenCalled();
    scope.stop();
  });
});
