<script setup lang="ts">
import { ref } from 'vue';

import { getMyTasks } from '@/api/inspection';
import { onShow } from '@dcloudio/uni-app';

interface TaskItem {
  id: string;
  workOrderNumber: string;
  processName: string;
  partName: string;
  status: string;
  priority: string;
  reporterName: string;
  createdAt: string;
}

const tabs = [
  { label: '全部', value: '' },
  { label: '待检验', value: 'DISPATCHED' },
  { label: '检验中', value: 'INSPECTING' },
  { label: '已完成', value: 'CLOSED' },
];

const activeTab = ref('');
const tasks = ref<unknown[]>([]);
const loading = ref(false);
const refreshing = ref(false);
const page = ref(1);
const noMore = ref(false);
const PAGE_SIZE = 10;

async function fetchTasks(reset = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const currentPage = reset ? 1 : page.value;
    const res = await getMyTasks({
      status: activeTab.value || undefined,
      page: currentPage,
      pageSize: PAGE_SIZE,
    });
    if (res.code === 0) {
      const items = res.data.items;
      tasks.value = reset ? items : [...tasks.value, ...items];
      noMore.value = tasks.value.length >= res.data.total;
      if (reset) page.value = 1;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function switchTab(value: string) {
  if (activeTab.value === value) return;
  activeTab.value = value;
  page.value = 1;
  noMore.value = false;
  fetchTasks(true);
}

function onRefresh() {
  refreshing.value = true;
  page.value = 1;
  noMore.value = false;
  fetchTasks(true);
}

function loadMore() {
  if (noMore.value || loading.value) return;
  page.value++;
  fetchTasks(false);
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/tasks/detail?id=${id}` });
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    SUBMITTED: '待派单',
    DISPATCHED: '待检验',
    INSPECTING: '检验中',
    CLOSED: '已完成',
  };
  return map[status] ?? status;
}

function getStatusClass(status: string) {
  const map: Record<string, string> = {
    SUBMITTED: 'status-submitted',
    DISPATCHED: 'status-dispatched',
    INSPECTING: 'status-inspecting',
    CLOSED: 'status-closed',
  };
  return map[status] ?? '';
}

function isPriority(priority: string) {
  return priority === 'HIGH' || priority === 'URGENT';
}

function getPriorityLabel(priority: string) {
  return priority === 'URGENT' ? '紧急' : '高优';
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

onShow(() => {
  fetchTasks(true);
});
</script>

<template>
  <view class="page">
    <!-- Tab Filter -->
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: activeTab === tab.value }"
        @tap="switchTab(tab.value)"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- Task List -->
    <scroll-view
      class="list"
      scroll-y
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <view v-if="tasks.length === 0 && !loading" class="empty">
        <text class="empty-text">暂无任务</text>
      </view>

      <view
        v-for="task in tasks"
        :key="(task as TaskItem).id"
        class="card"
        @tap="goDetail((task as TaskItem).id)"
      >
        <view class="card-header">
          <text class="work-order">{{
            (task as TaskItem).workOrderNumber
          }}</text>
          <view
            class="status-badge"
            :class="getStatusClass((task as TaskItem).status)"
          >
            <text class="status-text">{{
              getStatusLabel((task as TaskItem).status)
            }}</text>
          </view>
        </view>
        <view class="card-body">
          <text class="process-name"
            >{{ (task as TaskItem).processName }} ·
            {{ (task as TaskItem).partName }}</text
          >
          <view
            v-if="isPriority((task as TaskItem).priority)"
            class="priority-tag"
          >
            <text class="priority-text">{{
              getPriorityLabel((task as TaskItem).priority)
            }}</text>
          </view>
        </view>
        <view class="card-footer">
          <text class="meta"
            >申请人：{{ (task as TaskItem).reporterName }}</text
          >
          <text class="meta">{{
            formatDate((task as TaskItem).createdAt)
          }}</text>
        </view>
      </view>

      <view v-if="loading && tasks.length > 0" class="loading-more">
        <text class="loading-text">加载中...</text>
      </view>
      <view v-if="noMore && tasks.length > 0" class="no-more">
        <text class="no-more-text">没有更多了</text>
      </view>
    </scroll-view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.tabs {
  display: flex;
  flex-shrink: 0;
  background: #fff;
  border-bottom: 1rpx solid #eee;
}

.tab-item {
  flex: 1;
  padding: 24rpx 0;
  font-size: 28rpx;
  color: #666;
  text-align: center;

  &.active {
    font-weight: 600;
    color: #1890ff;
    border-bottom: 4rpx solid #1890ff;
  }
}

.list {
  flex: 1;
  padding: 20rpx;
  overflow: hidden;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;

  .empty-text {
    font-size: 28rpx;
    color: #999;
  }
}

.card {
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
  margin-bottom: 16rpx;
}

.work-order {
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
}

.status-badge {
  padding: 6rpx 16rpx;
  border-radius: 8rpx;

  &.status-submitted {
    background: #fff7e6;
  }

  &.status-dispatched {
    background: #e6f7ff;
  }

  &.status-inspecting {
    background: #f6ffed;
  }

  &.status-closed {
    background: #f5f5f5;
  }
}

.status-text {
  font-size: 24rpx;

  .status-submitted & {
    color: #fa8c16;
  }

  .status-dispatched & {
    color: #1890ff;
  }

  .status-inspecting & {
    color: #52c41a;
  }

  .status-closed & {
    color: #999;
  }
}

.card-body {
  display: flex;
  gap: 16rpx;
  align-items: center;
  margin-bottom: 16rpx;
}

.process-name {
  font-size: 28rpx;
  color: #555;
}

.priority-tag {
  padding: 4rpx 12rpx;
  background: #fff1f0;
  border-radius: 6rpx;

  .priority-text {
    font-size: 22rpx;
    color: #f5222d;
  }
}

.card-footer {
  display: flex;
  justify-content: space-between;
}

.meta {
  font-size: 24rpx;
  color: #999;
}

.loading-more,
.no-more {
  padding: 24rpx 0;
  text-align: center;

  .loading-text,
  .no-more-text {
    font-size: 24rpx;
    color: #bbb;
  }
}
</style>
