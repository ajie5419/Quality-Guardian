import type { SystemUserApi } from '#/api/system/user';

import { computed, ref } from 'vue';

import { QMS_ROLE_NAMES } from '@qgs/shared';

import { getUserList } from '#/api/system/user';

export function useInspectionRequestInspectorOptions() {
  const inspectors = ref<SystemUserApi.User[]>([]);
  const userOptions = computed(() =>
    inspectors.value.map((user) => ({
      label: user.realName || user.username,
      value: user.id,
    })),
  );

  async function loadInspectorOptions() {
    const result = await getUserList({
      page: 1,
      pageSize: 100,
      roleName: QMS_ROLE_NAMES.INSPECTOR,
      status: 1,
    });
    inspectors.value = result.items || [];
  }

  return { loadInspectorOptions, userOptions };
}
