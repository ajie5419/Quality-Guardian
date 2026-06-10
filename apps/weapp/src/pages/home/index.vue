<script setup lang="ts">
import { computed, ref } from 'vue';

import { getInspectionRequests, getInspectionStats } from '@/api/inspection';
import { useUserStore } from '@/stores/user';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';

interface Task {
  id: string;
  requestNo: string;
  partName: string;
  workOrderNumber: string;
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

const statusLabel = computed(() => {
  if (isDispatcher.value)
    return { s1: '待派单', s2: '今日已派', s3: '检验完成' };
  return { s1: '我的待检', s2: '今日完成', s3: '待复检' };
});

async function loadData() {
  if (!userStore.isLoggedIn) return;
  loading.value = true;
  try {
    const taskParams = isDispatcher.value
      ? { status: 'SUBMITTED', mine: false, page: 1, pageSize: 5 }
      : { status: 'DISPATCHED', mine: true, page: 1, pageSize: 5 };

    const [statsRes, tasksRes] = await Promise.all([
      getInspectionStats(),
      getInspectionRequests(taskParams),
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

function goToTask(id: string) {
  const url = isDispatcher.value
    ? `/pages/tasks/dispatch?id=${id}`
    : `/pages/inspect/result?id=${id}`;
  uni.navigateTo({ url });
}

function formatStatus(status: string) {
  const map: Record<string, string> = {
    SUBMITTED: '待派单',
    DISPATCHED: '待检验',
    INSPECTING: '检验中',
    CLOSED: '已完成',
  };
  return map[status] || status;
}

function handleLogout() {
  uni.showModal({
    title: '切换账号',
    content: '确定退出当前账号？',
    success(res) {
      if (res.confirm) {
        userStore.logout();
      }
    },
  });
}
</script>

<template>
  <view class="home-page">
    <view class="header">
      <view class="header-left">
        <text class="greeting">{{ greeting }}</text>
        <text class="date">{{ today }}</text>
      </view>
      <view class="role-tag">
        <text class="role-text">{{ isDispatcher ? '管理员' : '检验员' }}</text>
      </view>
    </view>

    <view class="stats-row">
      <view class="stat-card stat-blue">
        <text class="stat-value">{{ stats.todayInspections }}</text>
        <text class="stat-label">{{ statusLabel.s1 }}</text>
      </view>
      <view class="stat-card stat-orange">
        <text class="stat-value">{{ stats.openIssuesCount }}</text>
        <text class="stat-label">{{ statusLabel.s2 }}</text>
      </view>
      <view class="stat-card stat-green">
        <text class="stat-value">{{ stats.todayWorkOrders }}</text>
        <text class="stat-label">{{ statusLabel.s3 }}</text>
      </view>
    </view>

    <view class="section">
      <text class="section-title">快捷入口</text>
      <view class="quick-actions">
        <view
          class="action-btn"
          @tap="uni.switchTab({ url: '/pages/tasks/index' })"
        >
          <view class="action-icon-wrap icon-task">
            <text class="action-icon">📋</text>
          </view>
          <text class="action-label">{{
            isDispatcher ? '待派单' : '待检验'
          }}</text>
        </view>
        <view
          class="action-btn"
          @tap="uni.switchTab({ url: '/pages/records/index' })"
        >
          <view class="action-icon-wrap icon-record">
            <text class="action-icon">📊</text>
          </view>
          <text class="action-label">检验记录</text>
        </view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">{{
        isDispatcher ? '待派单任务' : '待检验任务'
      }}</text>
      <view v-if="recentTasks.length === 0 && !loading" class="empty-tip">
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
          <text class="task-status">{{ formatStatus(task.status) }}</text>
        </view>
        <text class="task-name">{{
          task.partName || task.workOrderNumber
        }}</text>
        <text class="task-date">{{ task.createdAt }}</text>
      </view>
    </view>

    <view class="section logout-section">
      <button class="btn-logout" @tap="handleLogout">切换账号</button>
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
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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

.role-tag {
  padding: 8rpx 20rpx;
  background: rgb(255 255 255 / 20%);
  border-radius: 24rpx;
}

.role-text {
  font-size: 24rpx;
  color: #fff;
}

.stats-row {
  display: flex;
  gap: 20rpx;
  padding: 32rpx 32rpx 0;
  margin-top: -20rpx;
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

.action-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;

  &.icon-task {
    background: #e6f7ff;
  }

  &.icon-record {
    background: #f6ffed;
  }
}

.action-icon {
  font-size: 40rpx;
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

.logout-section {
  margin-top: 48rpx;
  text-align: center;
}

.btn-logout {
  width: 50%;
  height: 76rpx;
  font-size: 28rpx;
  line-height: 76rpx;
  color: $text-color-secondary;
  background: #fff;
  border: 1rpx solid #e8e8e8;
  border-radius: 12rpx;
}
</style>
