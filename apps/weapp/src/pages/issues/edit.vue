<script setup lang="ts">
import type { InspectionIssueRecord } from '@/api/issues';

import { ref } from 'vue';

import { getInspectionIssue } from '@/api/issues';
import IssueForm from '@/components/issues/IssueForm.vue';
import { useUserStore } from '@/stores/user';
import { onLoad } from '@dcloudio/uni-app';
import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';

const userStore = useUserStore();
const issue = ref<InspectionIssueRecord | null>(null);
const loading = ref(true);

async function loadIssue(id: string) {
  let message = '';
  try {
    const res = await getInspectionIssue(id);
    if (res.code === 0 && res.data) {
      issue.value = res.data;
    } else {
      message = res.message || '记录加载失败';
    }
  } catch {
    message = '网络错误，无法进入编辑';
  } finally {
    loading.value = false;
  }
  if (!issue.value) {
    uni.showToast({ title: message || '记录加载失败', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
  }
}

onLoad(async (options) => {
  if (!userStore.checkAuth()) return;
  await userStore.loadPermissionCodes();
  if (!userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.EDIT)) {
    uni.showToast({ title: '无权编辑不合格品项', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  const id = options?.id || '';
  if (!id) {
    uni.navigateBack();
    return;
  }
  await loadIssue(id);
});

function finish() {
  setTimeout(() => uni.navigateBack(), 600);
}
</script>

<template>
  <view v-if="loading" class="loading">加载中...</view>
  <IssueForm
    v-else-if="issue"
    mode="edit"
    :initial-data="issue"
    @cancel="uni.navigateBack()"
    @success="finish"
  />
</template>

<style lang="scss">
.loading {
  padding: 120rpx 0;
  font-size: 26rpx;
  color: $text-color-secondary;
  text-align: center;
}
</style>
