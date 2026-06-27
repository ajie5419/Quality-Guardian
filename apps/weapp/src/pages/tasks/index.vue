<script setup lang="ts">
import { computed, ref } from 'vue';

import { getInspectionRequests } from '@/api/inspection';
import { useUserStore } from '@/stores/user';
import { canDispatchByRoles } from '@/utils/roles';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';

interface TaskItem {
  id: string;
  requestNo: string;
  workOrderNumber: string;
  partName: string;
  processName: string;
  reporter: string;
  priority: number;
  submittedAt: string;
  createdAt: string;
}

const userStore = useUserStore();
const tasks = ref<TaskItem[]>([]);
const loading = ref(false);

const isDispatcher = computed(() => {
  const roles = userStore.userInfo?.roles ?? [];
  return canDispatchByRoles(roles);
});

const pageTitle = computed(() => (isDispatcher.value ? '待派单' : '待检验'));

function priorityLabel(priority: number): string {
  if (priority <= 1) return '紧急';
  if (priority === 2) return '高优';
  return '普通';
}

function priorityClass(priority: number): string {
  if (priority <= 1) return 'tag-urgent';
  if (priority === 2) return 'tag-high';
  return 'tag-normal';
}

function formatDate(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

function goTask(task: TaskItem) {
  if (isDispatcher.value) {
    uni.navigateTo({ url: `/pages/tasks/dispatch?id=${task.id}` });
  } else {
    uni.navigateTo({ url: `/pages/inspect/result?id=${task.id}` });
  }
}

async function loadTasks() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await getInspectionRequests({
      status: isDispatcher.value ? 'SUBMITTED' : 'DISPATCHED',
      mine: !isDispatcher.value,
      page: 1,
      pageSize: 50,
    });
    if (res.code === 0) {
      tasks.value = (res.data.items ?? []) as TaskItem[];
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onShow(() => {
  loadTasks();
});

onPullDownRefresh(() => {
  loadTasks();
});
</script>

<template>
  <view class="page">
    <!-- Role header -->
    <view class="page-header">
      <text class="page-title">{{ pageTitle }}</text>
      <text class="task-count">{{ tasks.length }} 条</text>
    </view>

    <scroll-view scroll-y class="list">
      <view class="list-content">
        <!-- Empty state -->
        <view v-if="tasks.length === 0 && !loading" class="empty">
          <text class="empty-icon">📋</text>
          <text class="empty-text">暂无{{ pageTitle }}任务</text>
        </view>

        <!-- Loading skeleton (first load) -->
        <view v-if="loading && tasks.length === 0" class="loading-wrap">
          <text class="loading-text">加载中...</text>
        </view>

        <view
          v-for="task in tasks"
          :key="task.id"
          class="card"
          @tap="goTask(task)"
        >
          <view class="card-header">
            <text class="request-no">{{ task.requestNo }}</text>
            <view class="priority-tag" :class="priorityClass(task.priority)">
              <text class="priority-text">{{
                priorityLabel(task.priority)
              }}</text>
            </view>
          </view>
          <view class="card-body">
            <view class="info-row">
              <text class="info-label">工单号</text>
              <text class="info-value">{{ task.workOrderNumber }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">零件</text>
              <text class="info-value">{{ task.partName }}</text>
            </view>
            <view class="info-row">
              <text class="info-label">工序</text>
              <text class="info-value">{{ task.processName }}</text>
            </view>
          </view>
          <view class="card-footer">
            <text class="meta">报检人：{{ task.reporter }}</text>
            <text class="meta meta-date">{{
              formatDate(task.submittedAt || task.createdAt)
            }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg-color;
}

.page-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background: #fff;
  border-bottom: 1rpx solid $border-color;
}

.page-title {
  font-size: 34rpx;
  font-weight: 600;
  color: $text-color;
}

.task-count {
  font-size: 26rpx;
  color: $text-color-secondary;
}

.list {
  flex: 1;
  overflow: hidden;
}

.list-content {
  box-sizing: border-box;
  width: 100%;
  padding: 20rpx;
}

.empty {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;

  .empty-icon {
    font-size: 80rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #bbb;
  }
}

.loading-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80rpx 0;

  .loading-text {
    font-size: 28rpx;
    color: #bbb;
  }
}

.card {
  box-sizing: border-box;
  width: 100%;
  padding: 28rpx;
  margin-bottom: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.request-no {
  flex: 1;
  margin-right: 16rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 30rpx;
  font-weight: 600;
  color: $text-color;
  white-space: nowrap;
}

.priority-tag {
  box-sizing: border-box;
  flex-shrink: 0;
  max-width: 120rpx;
  padding: 6rpx 18rpx;
  border-radius: 8rpx;

  .priority-text {
    font-size: 24rpx;
  }

  &.tag-urgent {
    background: #fff1f0;

    .priority-text {
      color: $error-color;
    }
  }

  &.tag-high {
    background: #fff7e6;

    .priority-text {
      color: #fa8c16;
    }
  }

  &.tag-normal {
    background: #e6f7ff;

    .priority-text {
      color: $primary-color;
    }
  }
}

.card-body {
  padding-bottom: 16rpx;
  margin-bottom: 16rpx;
  border-bottom: 1rpx solid #f5f5f5;
}

.info-row {
  display: flex;
  padding: 10rpx 0;
}

.info-label {
  flex-shrink: 0;
  width: 100rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
}

.info-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 26rpx;
  color: $text-color;
  white-space: nowrap;
}

.card-footer {
  display: flex;
  gap: 16rpx;
  justify-content: space-between;
}

.meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 24rpx;
  color: #bbb;
  white-space: nowrap;
}

.meta-date {
  flex-shrink: 0;
}
</style>
