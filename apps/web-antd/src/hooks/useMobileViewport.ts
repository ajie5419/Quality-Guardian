import { computed, onMounted, onUnmounted, ref } from 'vue';

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1023;

export function useMobileViewport() {
  const viewportWidth = ref(
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );

  const syncViewportWidth = () => {
    if (typeof window === 'undefined') return;
    viewportWidth.value = window.innerWidth;
  };

  onMounted(() => {
    syncViewportWidth();
    window.addEventListener('resize', syncViewportWidth, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener('resize', syncViewportWidth);
  });

  const isMobile = computed(() => viewportWidth.value <= MOBILE_MAX_WIDTH);
  const isTablet = computed(
    () =>
      viewportWidth.value > MOBILE_MAX_WIDTH &&
      viewportWidth.value <= TABLET_MAX_WIDTH,
  );
  const isDesktop = computed(() => viewportWidth.value > TABLET_MAX_WIDTH);

  return {
    isDesktop,
    isMobile,
    isTablet,
    viewportWidth,
  };
}
