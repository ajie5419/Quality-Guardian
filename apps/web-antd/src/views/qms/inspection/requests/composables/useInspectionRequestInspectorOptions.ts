import { computed, ref } from 'vue';

import { getInspectionInspectors } from '#/api/qms/inspection-request';

export function useInspectionRequestInspectorOptions() {
  const inspectors = ref<
    Array<{ id: string; realName: null | string; username: string }>
  >([]);
  const userOptions = computed(() =>
    inspectors.value.map((user) => ({
      label: user.realName || user.username,
      value: user.id,
    })),
  );

  async function loadInspectorOptions() {
    inspectors.value = await getInspectionInspectors();
  }

  return { loadInspectorOptions, userOptions };
}
