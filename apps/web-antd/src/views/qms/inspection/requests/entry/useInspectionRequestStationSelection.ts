import { computed, watch } from 'vue';

type StationSelection = null | {
  indexes: number[];
  mode: 'ALL' | 'PARTIAL';
};

type RequestFormState = {
  quantity: number;
  stationSelection: StationSelection;
  workOrderNumber: string;
};

type WorkOrderOption = {
  division?: null | string;
  multiStationEnabled?: boolean;
  quantity?: number;
  value: string;
};

export function useInspectionRequestStationSelection(options: {
  requestForm: RequestFormState;
  workOrderOptions: { value: WorkOrderOption[] };
}) {
  const selectedWorkOrder = computed(() =>
    options.workOrderOptions.value.find(
      (item) => item.value === options.requestForm.workOrderNumber,
    ),
  );

  const stationQuantity = computed(() =>
    Math.max(0, Math.trunc(Number(selectedWorkOrder.value?.quantity || 0))),
  );

  const requiresStationSelection = computed(
    () =>
      stationQuantity.value > 1 &&
      selectedWorkOrder.value?.multiStationEnabled === true,
  );

  watch(
    requiresStationSelection,
    (required) => {
      if (!required) {
        options.requestForm.stationSelection = null;
      }
    },
    { immediate: true },
  );

  watch(stationQuantity, () => {
    const max = stationQuantity.value;
    const selection = options.requestForm.stationSelection;
    if (!selection || selection.mode === 'ALL') return;

    selection.indexes = selection.indexes.filter((item) => item <= max);
    if (selection.indexes.length === 0) {
      options.requestForm.stationSelection = null;
    }
  });

  return { requiresStationSelection, stationQuantity };
}
