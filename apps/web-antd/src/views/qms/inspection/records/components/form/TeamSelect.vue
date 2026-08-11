<script lang="ts" setup>
import type {
  InspectionRequestTeamOption,
  InspectionRequestTeamResolutionReason,
} from '@qgs/shared';

import { computed, onMounted, ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getPublicInspectionRequestTeams } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

type CurrentTeamOption = {
  disabled?: boolean;
  group: 'current';
  label: string;
  value: string;
};

type TeamOption = CurrentTeamOption | InspectionRequestTeamOption;

defineOptions({ name: 'TeamSelect' });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    legacyName?: string;
    value?: string;
  }>(),
  {
    disabled: false,
    legacyName: '',
    value: undefined,
  },
);

const emit = defineEmits<{
  change: [value: string | undefined, option?: TeamOption];
  resolved: [value: string, option: TeamOption];
  'update:value': [value: string | undefined];
}>();

const unresolvedTeamReasonLabels: Record<
  InspectionRequestTeamResolutionReason,
  string
> = {
  AMBIGUOUS_DEPARTMENT_SOURCE: '关联了多个责任部门',
  CONFLICTING_TEAM_SOURCES: '同时存在内部部门和供应商来源',
  INACTIVE_DEPARTMENT_SOURCE: '关联责任部门已停用',
  INVALID_EXTERNAL_SUPPLIER_MAPPING: '外协供应商映射无效',
  MISSING_RESPONSIBILITY_SOURCE: '未关联内部部门或外协供应商',
};

function formatUnresolvedTeamOption(option: InspectionRequestTeamOption) {
  const reason = option.reason
    ? unresolvedTeamReasonLabels[option.reason]
    : '责任身份未解析';
  return {
    ...option,
    disabled: true,
    label: `${option.label}（${reason}）`,
  };
}

const { handleApiError } = useErrorHandler();

const loading = ref(false);
const teamOptions = ref<TeamOption[]>([]);
const currentOption = computed<TeamOption | undefined>(() => {
  const value = String(props.value || '').trim();
  const label = String(props.legacyName || '').trim();
  if (!value || !label) return undefined;
  if (teamOptions.value.some((option) => option.value === value)) {
    return undefined;
  }
  return { group: 'current', label, value };
});
const options = computed(() => {
  const groups = [
    { group: 'current' as const, label: '当前值' },
    { group: 'internal' as const, label: '内部生产车间' },
    { group: 'external' as const, label: '外协加工单位' },
    { group: 'unresolved' as const, label: '待治理班组（不可选）' },
  ];
  return groups
    .map(({ group, label }) => ({
      label,
      options: [
        ...(currentOption.value?.group === group ? [currentOption.value] : []),
        ...teamOptions.value
          .filter((option) => option.group === group)
          .map((option) =>
            option.group === 'unresolved'
              ? formatUnresolvedTeamOption(option)
              : option,
          ),
      ],
    }))
    .filter((group) => group.options.length > 0);
});

function findCanonicalOption(value: string | undefined) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return undefined;
  return [...teamOptions.value, currentOption.value].find(
    (option) => option?.value === normalizedValue,
  );
}

function resolveCurrentValue() {
  const option = findCanonicalOption(props.value);
  if (option) emit('resolved', option.value, option);
}

async function loadData() {
  loading.value = true;
  try {
    teamOptions.value = await getPublicInspectionRequestTeams();
    resolveCurrentValue();
  } catch (error) {
    handleApiError(error, 'Load Team Select Data');
  } finally {
    loading.value = false;
  }
}

function handleChange(value: unknown) {
  const selectedValue = typeof value === 'string' ? value : undefined;
  const option = findCanonicalOption(selectedValue);
  const canonicalValue = option?.value;
  emit('update:value', canonicalValue);
  emit('change', canonicalValue, option);
}

onMounted(loadData);

watch(
  () => props.value,
  () => resolveCurrentValue(),
);
</script>

<template>
  <Select
    :value="value"
    :options="options"
    :loading="loading"
    :disabled="disabled"
    option-filter-prop="label"
    placeholder="请选择或搜索班组/外协单位"
    show-search
    allow-clear
    @change="handleChange"
    style="width: 100%"
  />
</template>
