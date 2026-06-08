<script setup lang="ts">
import { useUserStore } from '@/stores/user';
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  const userStore = useUserStore();
  userStore.checkAuth();
});
</script>

<style>
page {
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #f5f5f5;
}
</style>
