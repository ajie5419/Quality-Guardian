<script setup lang="ts">
import { computed, ref } from 'vue';

import { getInspectionRequests, getInspectionStats } from '@/api/inspection';
import { useUserStore } from '@/stores/user';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';

interface Task {
  id: string;
  requestNo: string;
  productName: string;
  status: string;
  createdAt: string;
}

interface Stats {
  todayInspections: number;
  openIssuesCount: number;
  todayWorkOrders: number;
}

const userStore = useUserStore();
const stats = ref<Stats>({
  todayInspections: 0,
  openIssuesCount: 0,
  todayWorkOrders: 0,
});
const recentTasks = ref<Task[]>([]);
const loading = ref(false);

const greeting = computed(() => {
  const name = userStore.userInfo?.realName ?? '';
  return `你好，${name}`;
});

const today = computed(() => {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
});

async function loadData() {
  if (!userStore.isLoggedIn) return;
  loading.value = true;
  try {
    const [statsRes, tasksRes] = await Promise.all([
      getInspectionStats(),
      getInspectionRequests({ mine: true, page: 1, pageSize: 3 }),
    ]);
    if (statsRes.code === 0 && statsRes.data?.stats)
      stats.value = statsRes.data.stats;
    if (tasksRes.code === 0) recentTasks.value = tasksRes.data.items as Task[];
  } catch {
    uni.showToast({ title: '数据加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onShow(() => {
  loadData();
});
onPullDownRefresh(() => {
  loadData();
});

const isDispatcher = computed(() => {
  const roles = userStore.userInfo?.roles ?? [];
  return roles.some(
    (r) =>
      r.includes('super') ||
      r.includes('admin') ||
      r.includes('dispatch') ||
      r.includes('manager') ||
      r.includes('schedule'),
  );
});

function goToTask(id: string) {
  const url = isDispatcher.value
    ? `/pages/tasks/dispatch?id=${id}`
    : `/pages/inspect/result?id=${id}`;
  uni.navigateTo({ url });
}
</script>

<template>
  <view class="home-page">
    <view class="header">
      <view class="header-left">
        <text class="greeting">{{ greeting }}</text>
        <text class="date">{{ today }}</text>
      </view>
    </view>

    <view class="stats-row">
      <view class="stat-card stat-blue">
        <text class="stat-value">{{ stats.todayInspections }}</text>
        <text class="stat-label">今日检验</text>
      </view>
      <view class="stat-card stat-orange">
        <text class="stat-value">{{ stats.openIssuesCount }}</text>
        <text class="stat-label">待处理</text>
      </view>
      <view class="stat-card stat-green">
        <text class="stat-value">{{ stats.todayWorkOrders }}</text>
        <text class="stat-label">今日工单</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">快捷入口</text>
      <view class="quick-actions">
        <view
          class="action-btn"
          @tap="uni.navigateTo({ url: '/pages/request/create' })"
        >
          <text class="action-icon">📋</text>
          <text class="action-label">报检申请</text>
        </view>
        <view
          class="action-btn"
          @tap="uni.switchTab({ url: '/pages/tasks/index' })"
        >
          <text class="action-icon">✅</text>
          <text class="action-label">我的任务</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">最近任务</text>
      <view v-if="recentTasks.length === 0" class="empty-tip">
        <text>暂无任务</text>
      </view>
      <view
        v-for="task in recentTasks"
        :key="task.id"
        class="task-card"
        @tap="goToTask(task.id)"
      >
        <view class="task-row">
          <text class="task-no">{{ task.requestNo }}</text>
          <text class="task-status">{{ task.status }}</text>
        </view>
        <text class="task-name">{{ task.productName }}</text>
        <text class="task-date">{{ task.createdAt }}</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.home-page {
  min-height: 100vh;
  padding-bottom: 40rpx;
  background: $bg-color;
}

.header {
  padding: 60rpx 40rpx 40rpx;
  background: $primary-color;
}

.greeting {
  display: block;
  margin-bottom: 8rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
}

.date {
  font-size: 26rpx;
  color: rgb(255 255 255 / 80%);
}

.stats-row {
  display: flex;
  gap: 20rpx;
  padding: 32rpx 32rpx 0;
}

.stat-card {
  flex: 1;
  padding: 28rpx 16rpx 24rpx;
  text-align: center;
  background: #fff;
  border-top: 6rpx solid transparent;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);

  &.stat-blue {
    border-top-color: $primary-color;
  }

  &.stat-orange {
    border-top-color: #fa8c16;
  }

  &.stat-green {
    border-top-color: #52c41a;
  }
}

.stat-value {
  display: block;
  font-size: 52rpx;
  font-weight: 700;
  line-height: 1.1;
  color: $text-color;
}

.stat-label {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: $text-color-secondary;
}

.section {
  margin: 32rpx 32rpx 0;
}

.section-title {
  display: block;
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: $text-color;
}

.quick-actions {
  display: flex;
  gap: 24rpx;
}

.action-btn {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16rpx;
  align-items: center;
  padding: 36rpx 16rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.action-icon {
  font-size: 48rpx;
}

.action-label {
  font-size: 28rpx;
  font-weight: 500;
  color: $text-color;
}

.empty-tip {
  padding: 48rpx;
  font-size: 28rpx;
  color: $text-color-secondary;
  text-align: center;
  background: #fff;
  border-radius: 16rpx;
}

.task-card {
  padding: 28rpx;
  margin-bottom: 16rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}

.task-no {
  font-size: 28rpx;
  font-weight: 600;
  color: $primary-color;
}

.task-status {
  padding: 4rpx 16rpx;
  font-size: 24rpx;
  color: $text-color-secondary;
  background: $bg-color;
  border-radius: 20rpx;
}

.task-name {
  display: block;
  margin-bottom: 8rpx;
  font-size: 28rpx;
  color: $text-color;
}

.task-date {
  font-size: 24rpx;
  color: $text-color-secondary;
}
</style>
