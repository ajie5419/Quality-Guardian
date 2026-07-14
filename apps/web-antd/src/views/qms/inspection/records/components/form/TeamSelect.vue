<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';

import { Select } from 'ant-design-vue';

import { getPublicInspectionRequestTeams } from '#/api/qms/inspection-request';
import { useErrorHandler } from '#/hooks/useErrorHandler';

interface TeamOption {
  group: 'current' | 'external' | 'internal';
  label: string;
  value: string;
}

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
  ];
  return groups
    .map(({ group, label }) => ({
      label,
      options: [
        ...(currentOption.value?.group === group ? [currentOption.value] : []),
        ...teamOptions.value.filter((option) => option.group === group),
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
