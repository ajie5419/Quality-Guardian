<script setup lang="ts">
import { ref } from 'vue';

import { getMyRecords } from '@/api/inspection';
import { onShow } from '@dcloudio/uni-app';

interface RecordItem {
  id: string;
  workOrderNumber: string;
  partName: string;
  overallResult: 'FAIL' | 'PASS';
  passCount: number;
  failCount: number;
  inspectionDate: string;
}

const records = ref<unknown[]>([]);
const loading = ref(false);
const refreshing = ref(false);
const page = ref(1);
const noMore = ref(false);
const PAGE_SIZE = 10;

async function fetchRecords(reset = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const currentPage = reset ? 1 : page.value;
    const res = await getMyRecords({ page: currentPage, pageSize: PAGE_SIZE });
    if (res.code === 0) {
      const items = res.data.items;
      records.value = reset ? items : [...records.value, ...items];
      noMore.value = records.value.length >= res.data.total;
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

function onRefresh() {
  refreshing.value = true;
  page.value = 1;
  noMore.value = false;
  fetchRecords(true);
}

function loadMore() {
  if (noMore.value || loading.value) return;
  page.value++;
  fetchRecords(false);
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/tasks/detail?id=${id}` });
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return dateStr.slice(0, 10);
}

onShow(() => {
  fetchRecords(true);
});
</script>

<template>
  <view class="page">
    <scroll-view
      class="list"
      scroll-y
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="loadMore"
    >
      <view v-if="records.length === 0 && !loading" class="empty">
        <text class="empty-text">暂无记录</text>
      </view>

      <view
        v-for="record in records"
        :key="(record as RecordItem).id"
        class="card"
        @tap="goDetail((record as RecordItem).id)"
      >
        <view class="card-header">
          <text class="work-order">{{
            (record as RecordItem).workOrderNumber
          }}</text>
          <view
            class="result-badge"
            :class="
              (record as RecordItem).overallResult === 'PASS'
                ? 'badge-pass'
                : 'badge-fail'
            "
          >
            <text class="badge-text">
              {{
                (record as RecordItem).overallResult === 'PASS'
                  ? '合格'
                  : '不合格'
              }}
            </text>
          </view>
        </view>

        <view class="card-body">
          <text class="part-name">{{ (record as RecordItem).partName }}</text>
          <view class="summary">
            <text class="summary-pass"
              >合格 {{ (record as RecordItem).passCount }}</text
            >
            <text class="summary-sep"> / </text>
            <text class="summary-fail"
              >不合格 {{ (record as RecordItem).failCount }}</text
            >
          </view>
        </view>

        <view class="card-footer">
          <text class="meta"
            >检验日期：{{
              formatDate((record as RecordItem).inspectionDate)
            }}</text
          >
        </view>
      </view>

      <view v-if="loading && records.length > 0" class="loading-more">
        <text class="loading-text">加载中...</text>
      </view>
      <view v-if="noMore && records.length > 0" class="no-more">
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

.result-badge {
  padding: 6rpx 16rpx;
  border-radius: 8rpx;

  &.badge-pass {
    background: #f6ffed;
  }

  &.badge-fail {
    background: #fff1f0;
  }

  .badge-text {
    font-size: 24rpx;

    .badge-pass & {
      color: #52c41a;
    }

    .badge-fail & {
      color: #f5222d;
    }
  }
}

.card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.part-name {
  font-size: 28rpx;
  color: #555;
}

.summary {
  display: flex;
  align-items: center;

  .summary-pass {
    font-size: 26rpx;
    color: #52c41a;
  }

  .summary-sep {
    margin: 0 4rpx;
    font-size: 26rpx;
    color: #ccc;
  }

  .summary-fail {
    font-size: 26rpx;
    color: #f5222d;
  }
}

.card-footer {
  display: flex;
  justify-content: flex-end;
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
