<script setup lang="ts">
import { ref } from 'vue';

import IssueForm from '@/components/issues/IssueForm.vue';
import { useUserStore } from '@/stores/user';
import { onLoad } from '@dcloudio/uni-app';
import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';

const userStore = useUserStore();
const ready = ref(false);

onLoad(async () => {
  if (!userStore.checkAuth()) return;
  await userStore.loadPermissionCodes();
  if (!userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.CREATE)) {
    uni.showToast({ title: '无权新增不合格品项', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  ready.value = true;
});

function finish() {
  setTimeout(() => uni.navigateBack(), 600);
}
</script>

<template>
  <IssueForm
    v-if="ready"
    mode="create"
    @cancel="uni.navigateBack()"
    @success="finish"
  />
</template>
