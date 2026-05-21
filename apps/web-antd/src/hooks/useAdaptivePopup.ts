import { computed } from 'vue';

import { useMobileViewport } from './useMobileViewport';

export function useAdaptivePopup() {
  const { isMobile } = useMobileViewport();

  const modalWidth = computed(() => (isMobile.value ? '100%' : undefined));

  const modalWrapClassName = computed(() =>
    isMobile.value ? 'qms-mobile-modal' : '',
  );

  return {
    isMobile,
    modalWidth,
    modalWrapClassName,
  };
}
