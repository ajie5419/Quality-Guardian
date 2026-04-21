import { computed, ref } from 'vue';

import { useI18n } from '@vben/locales';

import dayjs from 'dayjs';

import { useAvailableYears } from '#/hooks/useAvailableYears';

type WorkOrderDateMode = 'month' | 'week' | 'year';

export interface WorkOrderSearchFormValues {
  productName?: string;
  status?: string;
  workOrderNumber?: string;
}

export function useWorkOrderQueryFilters() {
  const { t } = useI18n();
  const { years: dynamicYears } = useAvailableYears();
  const currentYear = ref<number>(new Date().getFullYear());
  const currentDateMode = ref<WorkOrderDateMode>('year');
  const currentDate = ref(dayjs());

  const yearOptions = computed(() =>
    dynamicYears.value.map((y) => ({
      label: `${y}${t('qms.common.unit.year')}`,
      value: y,
    })),
  );

  const dateModeOptions = computed<
    Array<{ label: string; value: WorkOrderDateMode }>
  >(() => [
    { label: t('common.unit.year'), value: 'year' },
    { label: t('common.unit.month'), value: 'month' },
    { label: t('common.unit.week'), value: 'week' },
  ]);

  const dateRange = computed(() => {
    if (currentDateMode.value === 'year') {
      return {
        startDate: `${currentYear.value}-01-01`,
        endDate: `${currentYear.value}-12-31`,
      };
    }
    if (currentDateMode.value === 'month') {
      return {
        startDate: currentDate.value.startOf('month').format('YYYY-MM-DD'),
        endDate: currentDate.value.endOf('month').format('YYYY-MM-DD'),
      };
    }
    return {
      startDate: currentDate.value.startOf('week').format('YYYY-MM-DD'),
      endDate: currentDate.value.endOf('week').format('YYYY-MM-DD'),
    };
  });

  function buildQueryParams(formValues: WorkOrderSearchFormValues = {}) {
    const { productName, ...rest } = formValues;
    return {
      ...rest,
      granularity: currentDateMode.value,
      productName: productName?.trim() || undefined,
      startDate: dateRange.value.startDate,
      endDate: dateRange.value.endDate,
      year: currentYear.value,
    };
  }

  return {
    buildQueryParams,
    currentDate,
    currentDateMode,
    currentYear,
    dateModeOptions,
    yearOptions,
  };
}
