import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import TeamSelect from './TeamSelect.vue';

const { getPublicInspectionRequestTeams, handleApiError } = vi.hoisted(() => ({
  getPublicInspectionRequestTeams: vi.fn(),
  handleApiError: vi.fn(),
}));

vi.mock('#/api/qms/inspection-request', () => ({
  getPublicInspectionRequestTeams,
}));
vi.mock('#/hooks/useErrorHandler', () => ({
  useErrorHandler: () => ({ handleApiError }),
}));

vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Select: defineComponent({
      name: 'MockTeamSelectProbe',
      props: {
        options: { default: () => [], type: Array },
        value: { default: undefined, type: String },
      },
      emits: ['change'],
      setup() {
        return () => h('div', { 'data-testid': 'team-select-probe' });
      },
    }),
  };
});

const teams = [
  { group: 'internal' as const, label: 'Assembly Team', value: 'team-1' },
  {
    group: 'external' as const,
    label: 'Resident Supplier Team',
    value: 'team-2',
  },
];

describe('team select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublicInspectionRequestTeams.mockResolvedValue(teams);
  });

  it('uses canonical team ids and returns the canonical label on change', async () => {
    const wrapper = mount(TeamSelect);
    await flushPromises();

    const select = wrapper.findComponent({ name: 'MockTeamSelectProbe' });
    expect(getPublicInspectionRequestTeams).toHaveBeenCalledOnce();
    expect(select.props('options')).toEqual([
      {
        label: '内部生产车间',
        options: [teams[0]],
      },
      {
        label: '外协加工单位',
        options: [teams[1]],
      },
    ]);

    select.vm.$emit('change', 'team-2');
    await flushPromises();

    expect(wrapper.emitted('update:value')).toEqual([['team-2']]);
    expect(wrapper.emitted('change')).toEqual([['team-2', teams[1]]]);
  });

  it('resolves the canonical name for an id-only edit value', async () => {
    const wrapper = mount(TeamSelect, {
      props: { value: 'team-1' },
    });
    await flushPromises();

    expect(wrapper.emitted('resolved')).toEqual([['team-1', teams[0]]]);
  });

  it('shows unresolved TEAM identities as disabled with an actionable reason', async () => {
    getPublicInspectionRequestTeams.mockResolvedValue([
      {
        group: 'unresolved',
        label: 'Conflicted Team',
        reason: 'CONFLICTING_TEAM_SOURCES',
        value: 'team-conflicted',
      },
    ]);
    const wrapper = mount(TeamSelect);
    await flushPromises();

    const select = wrapper.findComponent({ name: 'MockTeamSelectProbe' });
    expect(select.props('options')).toEqual([
      {
        label: '待治理班组（不可选）',
        options: [
          {
            disabled: true,
            group: 'unresolved',
            label: 'Conflicted Team（同时存在内部部门和供应商来源）',
            reason: 'CONFLICTING_TEAM_SOURCES',
            value: 'team-conflicted',
          },
        ],
      },
    ]);
  });

  it('keeps an id-only legacy edit value outside the first option page', async () => {
    getPublicInspectionRequestTeams.mockResolvedValue([]);
    const wrapper = mount(TeamSelect, {
      props: { legacyName: 'Legacy Team', value: 'team-legacy' },
    });
    await flushPromises();

    expect(wrapper.emitted('resolved')).toEqual([
      [
        'team-legacy',
        {
          group: 'current',
          label: 'Legacy Team',
          value: 'team-legacy',
        },
      ],
    ]);
  });
});
