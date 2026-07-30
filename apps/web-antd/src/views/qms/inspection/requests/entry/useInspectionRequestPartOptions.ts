import type { Ref } from 'vue';

import { computed, onScopeDispose, ref } from 'vue';

import {
  getPublicInspectionRequestBomParts,
  getPublicInspectionRequestPartOptions,
} from '#/api/qms/inspection-request';

import { mapInspectionRequestEntryBomPartOptions } from './entry-mode';

type PartOption = {
  label: string;
  partName: string;
  value: string;
};

type RequestForm = {
  partId: string;
  partName: string;
  workOrderNumbers: string[];
};

interface UseInspectionRequestPartOptionsOptions {
  handleApiError: (error: unknown, action?: string) => void;
  isIncomingEntry: Ref<boolean>;
  requestForm: RequestForm;
  showError: (content: string) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

function workOrderKey(values: string[]) {
  return [...new Set(values.map((item) => item.trim()))]
    .filter(Boolean)
    .sort()
    .join('\0');
}

export function useInspectionRequestPartOptions(
  options: UseInspectionRequestPartOptionsOptions,
) {
  const bomPartOptions = ref<PartOption[]>([]);
  const canonicalPartOptions = ref<PartOption[]>([]);
  const bomPartsLoading = ref(false);
  const partSearchLoading = ref(false);
  let partSearchSequence = 0;
  let partSearchTimer: null | ReturnType<typeof setTimeout> = null;

  const partOptions = computed(() => {
    const merged = new Map<string, PartOption>();
    if (options.requestForm.partId && options.requestForm.partName) {
      merged.set(options.requestForm.partId, {
        label: options.requestForm.partName,
        partName: options.requestForm.partName,
        value: options.requestForm.partId,
      });
    }
    for (const item of canonicalPartOptions.value) merged.set(item.value, item);
    for (const item of bomPartOptions.value) {
      merged.set(item.value, { ...item, label: `BOM · ${item.label}` });
    }
    return [...merged.values()];
  });

  async function loadCanonicalPartOptions(keyword: string) {
    const sequence = ++partSearchSequence;
    if (!keyword) {
      canonicalPartOptions.value = [];
      partSearchLoading.value = false;
      return;
    }
    partSearchLoading.value = true;
    try {
      const list = await getPublicInspectionRequestPartOptions({ keyword });
      if (sequence !== partSearchSequence) return;
      canonicalPartOptions.value = list.map((item) => ({
        label: item.name,
        partName: item.name,
        value: item.id,
      }));
    } catch (error: unknown) {
      if (sequence !== partSearchSequence) return;
      options.handleApiError(error, 'Search Inspection Request Materials');
      canonicalPartOptions.value = [];
    } finally {
      if (sequence === partSearchSequence) partSearchLoading.value = false;
    }
  }

  function searchCanonicalPartOptions(keyword = '') {
    if (!options.isIncomingEntry.value) return;
    if (partSearchTimer !== null) clearTimeout(partSearchTimer);
    const normalizedKeyword = keyword.trim();
    if (!normalizedKeyword) {
      void loadCanonicalPartOptions('');
      return;
    }
    partSearchTimer = setTimeout(() => {
      void loadCanonicalPartOptions(normalizedKeyword);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function loadBomPartOptions(workOrderNumbers: string[]) {
    const requestKey = workOrderKey(workOrderNumbers);
    const normalized = requestKey.split('\0').filter(Boolean);
    if (normalized.length === 0) {
      bomPartOptions.value = [];
      return;
    }

    bomPartsLoading.value = true;
    try {
      const lists = await Promise.all(
        normalized.map((workOrderNumber) =>
          getPublicInspectionRequestBomParts({ workOrderNumber }),
        ),
      );
      if (workOrderKey(options.requestForm.workOrderNumbers) !== requestKey) {
        return;
      }
      bomPartOptions.value = mapInspectionRequestEntryBomPartOptions(
        lists.flat(),
      );
    } catch (error: unknown) {
      if (workOrderKey(options.requestForm.workOrderNumbers) !== requestKey) {
        return;
      }
      bomPartOptions.value = [];
      options.handleApiError(error, 'Load Inspection Request BOM Materials');
      options.showError(
        'BOM materials failed to load. Search is still available.',
      );
    } finally {
      if (workOrderKey(options.requestForm.workOrderNumbers) === requestKey) {
        bomPartsLoading.value = false;
      }
    }
  }

  onScopeDispose(() => {
    if (partSearchTimer !== null) clearTimeout(partSearchTimer);
  });

  return {
    bomPartOptions,
    bomPartsLoading,
    loadBomPartOptions,
    partOptions,
    partSearchLoading,
    searchCanonicalPartOptions,
  };
}
