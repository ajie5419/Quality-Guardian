import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MY_INSPECTION_RECEIPTS_KEY } from './myInspectionReceipts';
import MyInspectionRequests from './MyInspectionRequests.vue';

const mocks = vi.hoisted(() => ({
  accessToken: vi.fn(),
  getInspectionRequests: vi.fn(),
  getPublicInspectionRequestStatus: vi.fn(),
}));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessToken: mocks.accessToken() }),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getInspectionRequests: mocks.getInspectionRequests,
  getPublicInspectionRequestStatus: mocks.getPublicInspectionRequestStatus,
}));

vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError: vi.fn() }),
}));

const storage = new Map<string, string>();

function seedReceipts(receipts: unknown[]) {
  storage.set(MY_INSPECTION_RECEIPTS_KEY, JSON.stringify(receipts));
}

beforeEach(() => {
  storage.clear();
  mocks.accessToken.mockReturnValue('');
  mocks.getInspectionRequests.mockResolvedValue({ items: [], total: 0 });
  mocks.getPublicInspectionRequestStatus.mockResolvedValue({
    closedAt: null,
    dispatchedAt: null,
    dispatcherName: '',
    inspectorName: '检验员甲',
    linkedIssueStatus: null,
    requestNo: 'IR-20260818-0001',
    status: 'SUBMITTED',
  });
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});

describe('myInspectionRequests', () => {
  it('renders local receipts via the public status endpoint when anonymous', async () => {
    seedReceipts([
      {
        partName: '部件A',
        processName: '外购件',
        requestNo: 'IR-20260818-0001',
        submittedAt: '2026-08-18T02:00:00.000Z',
        workOrderNumber: 'WO-1',
      },
    ]);

    const wrapper = mount(MyInspectionRequests);
    await flushPromises();

    expect(mocks.getPublicInspectionRequestStatus).toHaveBeenCalledWith(
      'IR-20260818-0001',
    );
    expect(wrapper.text()).toContain('IR-20260818-0001');
    expect(wrapper.text()).toContain('部件A');
    expect(wrapper.text()).toContain('待派单');
  });

  it('renders the reporter scope when signed in', async () => {
    mocks.accessToken.mockReturnValue('token-1');
    mocks.getInspectionRequests.mockResolvedValue({
      items: [
        {
          dispatcherName: '',
          inspectorName: '',
          linkedIssueStatus: null,
          partName: '部件B',
          processName: '原材料',
          requestNo: 'IR-20260818-0002',
          status: 'DISPATCHED',
          submittedAt: '2026-08-18T03:00:00.000Z',
          workOrderNumber: 'WO-2',
        },
      ],
      total: 1,
    });

    const wrapper = mount(MyInspectionRequests);
    await flushPromises();

    expect(mocks.getInspectionRequests).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'my-report' }),
    );
    expect(wrapper.text()).toContain('IR-20260818-0002');
    expect(wrapper.text()).toContain('已派单');
  });

  it('still shows local receipts when the server scope fails', async () => {
    mocks.accessToken.mockReturnValue('token-1');
    mocks.getInspectionRequests.mockRejectedValue(new Error('boom'));
    seedReceipts([
      {
        partName: '部件C',
        processName: '外购件',
        requestNo: 'IR-20260818-0003',
        submittedAt: '2026-08-18T04:00:00.000Z',
        workOrderNumber: 'WO-3',
      },
    ]);

    const wrapper = mount(MyInspectionRequests);
    await flushPromises();

    expect(wrapper.text()).toContain('IR-20260818-0003');
    expect(wrapper.text()).toContain('部件C');
  });

  it('shows the empty state without receipts', async () => {
    const wrapper = mount(MyInspectionRequests);
    await flushPromises();

    expect(wrapper.text()).toContain('本机暂无报检记录');
  });
});
