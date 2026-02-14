import type { Ref } from 'vue';

import { reactive, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

import { useErrorHandler } from '#/hooks/useErrorHandler';

export interface UseSelectPaginationOptions<T> {
  fetchDataFn: (params: {
    [key: string]: boolean | number | string;
    page: number;
    pageSize: number;
  }) => Promise<{ items: T[]; total: number }>;
  getParams: (keyword: string) => Record<string, boolean | number | string>;
  valueKey: keyof T;
  echoFetcher?: (val: string) => Promise<null | T>;
}

export function useSelectPagination<T>(
  optionsConfig: UseSelectPaginationOptions<T>,
  propsValue: Ref<T[keyof T] | undefined>,
  emit: (event: 'change' | 'update:value', ...args: unknown[]) => void,
) {
  const { fetchDataFn, getParams, valueKey, echoFetcher } = optionsConfig;
  const { handleApiError } = useErrorHandler();

  const options = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const cachedSelectedItem = ref<null | T>(null) as Ref<null | T>;
  const searchText = ref('');

  const pagination = reactive({
    page: 1,
    pageSize: 20,
    total: 0,
  });

  const fetchItems = async (
    keyword: string = '',
    loadMore: boolean = false,
  ) => {
    if (loading.value) return;
    loading.value = true;
    try {
      if (loadMore) {
        pagination.page += 1;
      } else {
        pagination.page = 1;
        searchText.value = keyword.trim();
      }

      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...getParams(searchText.value),
      };

      const { items, total } = await fetchDataFn(params);
      pagination.total = total;

      const newItems = items || [];
      const currentOptions = loadMore ? options.value : [];

      // Deduplicate
      const merged = [...currentOptions, ...newItems] as T[];
      const uniqueMap = new Map<T[keyof T], T>();
      merged.forEach((item) => uniqueMap.set(item[valueKey], item));

      // Handle Echo Logic
      const currentVal = propsValue.value;
      if (currentVal) {
        if (uniqueMap.has(currentVal)) {
          cachedSelectedItem.value = uniqueMap.get(currentVal) || null;
        } else if (
          cachedSelectedItem.value &&
          cachedSelectedItem.value[valueKey] === currentVal
        ) {
          uniqueMap.set(currentVal, cachedSelectedItem.value);
        } else {
          // Fetch specific if missing
          if (echoFetcher) {
            try {
              const exactMatch = await echoFetcher(String(currentVal));
              if (exactMatch) {
                cachedSelectedItem.value = exactMatch;
                uniqueMap.set(currentVal, exactMatch);
              }
            } catch (error) {
              handleApiError(error, 'Select Echo Fetch');
            }
          }
        }
      }

      options.value = [...uniqueMap.values()];
    } catch (error) {
      handleApiError(error, 'Select Pagination Query');
      if (loadMore) pagination.page -= 1;
    } finally {
      loading.value = false;
    }
  };

  const handleSearch = useDebounceFn((val: string) => {
    fetchItems(val, false);
  }, 300);

  const handlePopupScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    if (
      target.scrollTop + target.offsetHeight >= target.scrollHeight - 10 &&
      options.value.length < pagination.total &&
      !loading.value
    ) {
      fetchItems(searchText.value, true);
    }
  };

  const handleChange = (val: unknown, option: unknown) => {
    const castedVal = val as T[keyof T] | undefined;
    emit('update:value', castedVal);
    emit('change', castedVal, option);
    const selectedItem =
      option && typeof option === 'object' && 'item' in option
        ? (option as { item?: T }).item
        : (option as T | undefined);
    if (castedVal && selectedItem) {
      cachedSelectedItem.value = selectedItem as T;
    } else if (!castedVal) {
      cachedSelectedItem.value = null;
    }
  };

  watch(
    () => propsValue.value,
    (newVal) => {
      if (newVal && !options.value.some((o) => o[valueKey] === newVal)) {
        // Trigger fetch (which handles echo) or specific echo fetch?
        fetchItems(searchText.value, false);
      }
    },
  );

  return {
    options,
    loading,
    handleSearch,
    handlePopupScroll,
    handleChange,
    fetchItems,
  };
}
