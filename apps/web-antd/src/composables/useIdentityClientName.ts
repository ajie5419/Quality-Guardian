import type { Ref } from 'vue';

import { ref, watch } from 'vue';

import { getIdentityClientName } from '#/api/core/identity-bridge';

type Target = null | { clientId: string; redirectUri: string };

/**
 * Loads the target system's display name from the backend registration. The
 * name never comes from the URL; unknown clients leave it empty.
 */
export function useIdentityClientName(target: Ref<Target>) {
  const name = ref('');
  let latest = 0;

  watch(
    target,
    async (value) => {
      const ticket = ++latest;
      name.value = '';
      if (!value) return;
      try {
        const result = await getIdentityClientName(value);
        if (ticket === latest) name.value = result.name;
      } catch {
        // Unknown client or network failure: keep the neutral label.
      }
    },
    { immediate: true },
  );

  return name;
}
