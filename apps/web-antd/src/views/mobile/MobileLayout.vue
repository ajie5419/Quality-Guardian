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

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { useWechatAuth } from './composables/useWechatAuth';

const route = useRoute();
const { auth, checkExistingToken, isAuthed, loading } = useWechatAuth();

onMounted(() => {
  if (!checkExistingToken()) {
    void auth();
  }
});
</script>

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
  color: #666;
  font-size: 16px;
}
</style>
