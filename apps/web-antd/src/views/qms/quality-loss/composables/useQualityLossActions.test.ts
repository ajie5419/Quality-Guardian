import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQualityLossActions } from './useQualityLossActions';

const mocks = vi.hoisted(() => ({
  batchDeleteQualityLoss: vi.fn(),
  deleteQualityLoss: vi.fn(),
  modalConfirm: vi.fn(),
}));

vi.mock('@vben/locales', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), warning: vi.fn() },
  Modal: { confirm: mocks.modalConfirm },
}));

vi.mock('#/api/qms/quality-loss', () => ({
  batchDeleteQualityLoss: mocks.batchDeleteQualityLoss,
  deleteQualityLoss: mocks.deleteQualityLoss,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

describe('useQualityLossActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batchDeleteQualityLoss.mockResolvedValue({ successCount: 1 });
    mocks.deleteQualityLoss.mockResolvedValue(undefined);
  });

  it('deletes a materialized row by its source primary key', async () => {
    let confirmAction: (() => Promise<void>) | undefined;
    mocks.modalConfirm.mockImplementation((options) => {
      confirmAction = options.onOk;
    });
    const actions = useQualityLossActions({ reload: vi.fn() }, vi.fn());

    await actions.handleDelete({
      id: 'QL-cmrirra7i00lyng01jigslrpf',
      pk: 'cmrirra7i00lyng01jigslrpf',
    } as never);
    await confirmAction?.();

    expect(mocks.deleteQualityLoss).toHaveBeenCalledWith(
      'cmrirra7i00lyng01jigslrpf',
    );
  });

  it('batch deletes materialized rows by their source primary keys', async () => {
    let confirmAction: (() => Promise<void>) | undefined;
    mocks.modalConfirm.mockImplementation((options) => {
      confirmAction = options.onOk;
    });
    const actions = useQualityLossActions({ reload: vi.fn() }, vi.fn());
    actions.checkedRows.value = [
      {
        id: 'QL-cmrirra7i00lyng01jigslrpf',
        lossSource: 'Manual',
        pk: 'cmrirra7i00lyng01jigslrpf',
      },
    ] as never;

    actions.handleBatchDelete();
    await confirmAction?.();

    expect(mocks.batchDeleteQualityLoss).toHaveBeenCalledWith([
      'cmrirra7i00lyng01jigslrpf',
    ]);
  });
});
