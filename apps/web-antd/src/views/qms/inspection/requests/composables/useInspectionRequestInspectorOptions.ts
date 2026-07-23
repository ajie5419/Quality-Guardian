import type { SystemUserApi } from '#/api/system/user';

import { computed, ref } from 'vue';

import { QMS_ROLE_NAMES } from '@qgs/shared';

import { getAllUsers } from '#/api/system/user';

export function useInspectionRequestInspectorOptions() {
  const inspectors = ref<SystemUserApi.User[]>([]);
  const userOptions = computed(() =>
    inspectors.value.map((user) => ({
      label: user.realName || user.username,
      value: user.id,
    })),
  );

  async function loadInspectorOptions() {
    inspectors.value = await getAllUsers({
      roleName: QMS_ROLE_NAMES.INSPECTOR,
      status: 1,
    });
  }

  return { loadInspectorOptions, userOptions };
}
