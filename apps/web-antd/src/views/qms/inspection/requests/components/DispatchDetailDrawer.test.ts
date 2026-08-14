// @vitest-environment happy-dom

import type { InspectionRequest } from '@qgs/shared';

import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import DispatchDetailDrawer from './DispatchDetailDrawer.vue';

vi.mock('#/hooks/useMobileViewport', () => ({
  useMobileViewport: () => ({ isMobile: { value: false } }),
}));

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const SlotComponent = defineComponent({
    setup(_, { slots }) {
      return () => h('div', [slots.default?.(), slots.footer?.()]);
    },
  });
  return { Button: SlotComponent, Drawer: SlotComponent, Tag: SlotComponent };
});

const SlotStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.default?.(), slots.footer?.()]);
  },
});

function createRequest(
  overrides: Partial<InspectionRequest> = {},
): InspectionRequest {
  return {
    createdAt: '2026-08-13T00:00:00.000Z',
    id: 'request-1',
    mutualCheckResult: 'PASS',
    partName: 'Part A',
    priority: 1,
    processName: 'Process A',
    quantity: 1,
    reporter: 'Reporter A',
    requestNo: 'IR-001',
    selfCheckResult: 'PASS',
    status: 'SUBMITTED',
    submittedAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    workOrderNumber: 'WO-001',
    ...overrides,
  };
}

function mountDrawer(request: InspectionRequest) {
  return mount(DispatchDetailDrawer, {
    props: {
      directClosedClass: () => '',
      displayDispatchTime: () => '-',
      displayDispatcher: () => '-',
      displayExecutionDuration: () => '-',
      displayInspector: () => '-',
      executionDurationLabel: () => 'Execution',
      formatDateTime: () => '-',
      hasLinkedIssue: () => false,
      inspectionQuantityText: () => '-',
      inspectionResultColor: () => '',
      inspectionResultLabel: () => '',
      issueStatusColor: () => '',
      issueStatusLabel: () => '',
      missingValueClass: () => '',
      open: true,
      request,
      statusColor: () => '',
      statusLabel: () => '',
      waitDuration: () => '-',
    },
    global: {
      stubs: {
        Button: SlotStub,
        Drawer: SlotStub,
        Tag: SlotStub,
      },
    },
  });
}

describe('dispatch detail drawer request identity', () => {
  it('shows the incoming supplier snapshot instead of the legacy team field', () => {
    const wrapper = mountDrawer(
      createRequest({
        category: 'INCOMING',
        supplierName: 'Supplier A',
        team: 'Legacy Team Value',
      }),
    );

    expect(wrapper.get('[data-testid="request-identity-label"]').text()).toBe(
      '供应商',
    );
    expect(wrapper.get('[data-testid="request-identity-value"]').text()).toBe(
      'Supplier A',
    );
  });

  it('does not fall back to team when an incoming supplier snapshot is absent', () => {
    const wrapper = mountDrawer(
      createRequest({
        category: 'INCOMING',
        supplierName: null,
        team: 'Legacy Team Value',
      }),
    );

    expect(wrapper.get('[data-testid="request-identity-label"]').text()).toBe(
      '供应商',
    );
    expect(wrapper.get('[data-testid="request-identity-value"]').text()).toBe(
      '-',
    );
  });

  it('shows the API-mapped internal responsibility department as the process team', () => {
    const wrapper = mountDrawer(
      createRequest({
        category: 'PROCESS',
        responsibilityType: 'INTERNAL_DEPARTMENT',
        responsibleDepartment: 'Structure BU1',
        team: 'Structure BU1',
      }),
    );

    expect(wrapper.get('[data-testid="request-identity-label"]').text()).toBe(
      '班组',
    );
    expect(wrapper.get('[data-testid="request-identity-value"]').text()).toBe(
      'Structure BU1',
    );
  });
});
