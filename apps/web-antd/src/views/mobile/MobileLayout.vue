<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { useAccessStore } from '@vben/stores';

const route = useRoute();
const accessStore = useAccessStore();
const loading = ref(true);
const isAuthed = ref(false);

onMounted(() => {
  const token = accessStore.accessToken || localStorage.getItem('mobile-token');
  if (token) {
    accessStore.setAccessToken(token);
    isAuthed.value = true;
  }
  loading.value = false;
});
</script>

<template>
  <div class="mobile-layout">
    <div v-if="loading" class="mobile-loading">Loading...</div>
    <template v-else-if="isAuthed">
      <div class="mobile-header">
        <h3>{{ route.meta.title || 'Quality Guardian' }}</h3>
      </div>
      <div class="mobile-content">
        <router-view />
      </div>
    </template>
    <div v-else class="mobile-error">Authentication failed</div>
  </div>
</template>

<style scoped>
.mobile-layout {
  min-height: 100vh;
  background: #f5f5f5;
}

.mobile-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 12px 16px;
  color: white;
  text-align: center;
  background: #1890ff;
}

.mobile-header h3 {
  margin: 0;
  font-size: 16px;
}

.mobile-content {
  padding: 12px;
}

.mobile-loading,
.mobile-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-size: 16px;
  color: #666;
}
</style>
