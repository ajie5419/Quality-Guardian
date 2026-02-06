import type { Ref } from 'vue';

import { reactive, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';

export interface UseSelectPaginationOptions<T> {
  fetchDataFn: (
    params: Record<string, unknown>,
  ) => Promise<{ items: T[]; total: number }>;
  getParams: (keyword: string) => Record<string, unknown>;
  valueKey: keyof T;
  echoFetcher?: (val: string) => Promise<null | T>;
}

export function useSelectPagination<T>(
  optionsConfig: UseSelectPaginationOptions<T>,
  propsValue: Ref<T[keyof T] | undefined>,
  emit: (event: string, ...args: any[]) => void,
) {
  const { fetchDataFn, getParams, valueKey, echoFetcher } = optionsConfig;

  const options = ref<T[]>([]) as Ref<T[]>;
  const loading = ref(false);
  const cachedSelectedItem = ref<null | T>(null);
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
          cachedSelectedItem.value = uniqueMap.get(currentVal);
        } else if (
          cachedSelectedItem.value &&
          String(cachedSelectedItem.value[valueKey]) === String(currentVal)
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
              console.error('Echo fetch failed:', error);
            }
          }
        }
      }

      options.value = [...uniqueMap.values()];
    } catch (error) {
      console.error(error);
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

  const handleChange = (
    val: T[keyof T] | undefined,
    option: Record<string, unknown> & { item?: T },
  ) => {
    emit('update:value', val);
    emit('change', val, option);
    if (val && option) {
      cachedSelectedItem.value = option.item || (option as unknown as T);
    } else if (!val) {
      cachedSelectedItem.value = null;
    }
  };

  watch(
    () => propsValue.value,
    (newVal) => {
      if (newVal && !options.value.some((o) => o[valueKey] === newVal)) {
        // Trigger fetch (which handles echo) or specific echo fetch?
        // Original code re-fetches list. Let's keep it simple.
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
