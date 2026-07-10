<script setup lang="ts">
import type { InspectionIssueRecord } from '@/api/issues';

import { computed, ref } from 'vue';

import { getInspectionIssues } from '@/api/issues';
import { buildResourceUrl } from '@/api/request';
import { useUserStore } from '@/stores/user';
import {
  formatDepartmentNames,
  loadDepartmentNameMap,
} from '@/utils/departments';
import { getIssueSeverityLabel, getIssueStatusLabel } from '@/utils/issues';
import { onShow } from '@dcloudio/uni-app';
import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';

const PAGE_SIZE = 10;
const STATUS_FILTERS = [
  { label: '全部', value: '' },
  { label: '待处理', value: 'OPEN' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '已关闭', value: 'CLOSED' },
];

const userStore = useUserStore();
const issues = ref<InspectionIssueRecord[]>([]);
const status = ref('');
const workOrderNumber = ref('');
const page = ref(1);
const total = ref(0);
const loading = ref(false);
const refreshing = ref(false);
const departmentNames = ref(new Map<string, string>());

const canCreate = computed(() =>
  userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.CREATE),
);
const canEdit = computed(() =>
  userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.EDIT),
);
const noMore = computed(() => issues.value.length >= total.value);

async function loadIssues(reset = false) {
  if (loading.value) return;
  loading.value = true;
  try {
    const currentPage = reset ? 1 : page.value + 1;
    const res = await getInspectionIssues({
      page: currentPage,
      pageSize: PAGE_SIZE,
      status: status.value || undefined,
      workOrderNumber: workOrderNumber.value.trim() || undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    if (res.code !== 0) throw new Error(res.message || '加载失败');
    const items = res.data.items || [];
    issues.value = reset ? items : [...issues.value, ...items];
    total.value = res.data.total || 0;
    page.value = currentPage;
  } catch (error) {
    uni.showToast({
      title: error instanceof Error ? error.message : '加载失败',
      icon: 'none',
    });
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function changeStatus(nextStatus: string) {
  if (loading.value || status.value === nextStatus) return;
  status.value = nextStatus;
  page.value = 1;
  void loadIssues(true);
}

function refresh() {
  if (loading.value) return;
  refreshing.value = true;
  void loadIssues(true);
}

function loadMore() {
  if (loading.value || noMore.value) return;
  void loadIssues();
}

function openIssue(issue: InspectionIssueRecord) {
  uni.navigateTo({ url: `/pages/issues/detail?id=${issue.id}` });
}

function editIssue(issue: InspectionIssueRecord) {
  uni.navigateTo({ url: `/pages/issues/edit?id=${issue.id}` });
}

function previewPhoto(issue: InspectionIssueRecord) {
  if (!issue.photos?.length) return;
  uni.previewImage({
    urls: issue.photos.map((photo) => buildResourceUrl(photo)),
  });
}

function statusClass(value: string) {
  return `status-${String(value || '')
    .toLowerCase()
    .replace('_', '-')}`;
}

function displayDepartments(issue: InspectionIssueRecord) {
  return formatDepartmentNames(
    departmentNames.value,
    issue.responsibleDepartments,
    issue.responsibleDepartment,
  );
}

onShow(async () => {
  if (!userStore.checkAuth()) return;
  await userStore.loadPermissionCodes();
  if (!userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.LIST)) {
    uni.showToast({ title: '无权查看不合格品项', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  departmentNames.value = await loadDepartmentNameMap();
  await loadIssues(true);
});
</script>

<template>
  <view class="page">
    <view class="toolbar">
      <view class="search-row">
        <input
          v-model="workOrderNumber"
          class="search-input"
          placeholder="按工单号搜索"
          confirm-type="search"
          @confirm="loadIssues(true)"
        />
        <button class="search-button" @tap="loadIssues(true)">搜索</button>
      </view>
      <scroll-view scroll-x class="status-tabs">
        <view class="status-tabs-inner">
          <view
            v-for="item in STATUS_FILTERS"
            :key="item.value"
            class="status-tab"
            :class="{ active: status === item.value }"
            @tap="changeStatus(item.value)"
          >
            {{ item.label }}
          </view>
        </view>
      </scroll-view>
    </view>

    <scroll-view
      scroll-y
      class="issue-list"
      refresher-enabled
      :refresher-triggered="refreshing"
      @refresherrefresh="refresh"
      @scrolltolower="loadMore"
    >
      <view class="list-content">
        <view v-if="issues.length === 0 && !loading" class="empty"
          >暂无不合格品项</view
        >
        <view
          v-for="issue in issues"
          :key="issue.id"
          class="issue-card"
          @tap="openIssue(issue)"
        >
          <view class="card-heading">
            <view class="heading-main">
              <text class="nc-number">{{ issue.ncNumber || '-' }}</text>
              <text class="part-name">{{ issue.partName || '-' }}</text>
            </view>
            <view class="status-tag" :class="statusClass(String(issue.status))">
              {{ getIssueStatusLabel(String(issue.status)) }}
            </view>
          </view>
          <view class="card-meta">
            <text>{{ issue.workOrderNumber || '-' }}</text>
            <text>{{ issue.processName || '-' }}</text>
          </view>
          <text class="description">{{ issue.description || '-' }}</text>
          <view class="card-grid">
            <view>
              <text class="meta-label">严重程度</text>
              <text>{{ getIssueSeverityLabel(String(issue.severity)) }}</text>
            </view>
            <view>
              <text class="meta-label">责任部门</text>
              <text>{{ displayDepartments(issue) }}</text>
            </view>
            <view>
              <text class="meta-label">缺陷分类</text>
              <text>{{ issue.defectType || '-' }}</text>
            </view>
            <view>
              <text class="meta-label">发现日期</text>
              <text>{{ issue.reportDate || '-' }}</text>
            </view>
          </view>
          <view class="card-footer">
            <image
              v-if="issue.photos?.[0]"
              class="thumb"
              :src="buildResourceUrl(issue.photos[0])"
              mode="aspectFill"
              @tap.stop="previewPhoto(issue)"
            />
            <button
              v-if="canEdit"
              class="edit-button"
              size="mini"
              @tap.stop="editIssue(issue)"
            >
              编辑
            </button>
          </view>
        </view>
        <view v-if="loading" class="list-tip">加载中...</view>
        <view v-else-if="issues.length > 0 && noMore" class="list-tip"
          >没有更多了</view
        >
      </view>
    </scroll-view>

    <button
      v-if="canCreate"
      class="create-button"
      @tap="uni.navigateTo({ url: '/pages/issues/create' })"
    >
      +
    </button>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg-color;
}

.toolbar {
  flex-shrink: 0;
  padding: 20rpx 24rpx 0;
  background: #fff;
  border-bottom: 1rpx solid $border-color;
}

.search-row {
  display: flex;
  gap: 16rpx;
}

.search-input {
  box-sizing: border-box;
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  font-size: 26rpx;
  background: #f5f5f5;
  border-radius: 8rpx;
}

.search-button {
  width: 120rpx;
  height: 72rpx;
  margin: 0;
  font-size: 26rpx;
  line-height: 72rpx;
  color: #fff;
  background: $primary-color;
  border-radius: 8rpx;
}

.status-tabs {
  width: 100%;
  margin-top: 16rpx;
  white-space: nowrap;
}

.status-tabs-inner {
  display: flex;
}

.status-tab {
  flex-shrink: 0;
  padding: 18rpx 28rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
  border-bottom: 4rpx solid transparent;

  &.active {
    color: $primary-color;
    border-bottom-color: $primary-color;
  }
}

.issue-list {
  flex: 1;
  overflow: hidden;
}

.list-content {
  padding: 20rpx 20rpx 140rpx;
}

.issue-card {
  padding: 26rpx;
  margin-bottom: 20rpx;
  background: #fff;
  border-radius: 12rpx;
  box-shadow: 0 2rpx 10rpx rgb(0 0 0 / 5%);
}

.card-heading,
.card-footer,
.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.heading-main {
  min-width: 0;
}

.nc-number {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: $text-color;
}

.part-name,
.card-meta,
.description {
  font-size: 25rpx;
  color: $text-color-secondary;
}

.part-name {
  display: block;
  margin-top: 6rpx;
}

.status-tag {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  font-size: 22rpx;
  color: #cf1322;
  background: #fff1f0;
  border-radius: 6rpx;

  &.status-in-progress {
    color: #d46b08;
    background: #fff7e6;
  }

  &.status-closed {
    color: #389e0d;
    background: #f6ffed;
  }
}

.card-meta {
  gap: 20rpx;
  justify-content: flex-start;
  padding: 16rpx 0;
  margin-top: 16rpx;
  border-top: 1rpx solid #f0f0f0;
}

.description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  line-height: 1.5;
  -webkit-box-orient: vertical;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx 24rpx;
  padding: 18rpx 0;
  font-size: 24rpx;
  color: $text-color;
}

.meta-label {
  display: block;
  margin-bottom: 4rpx;
  color: #999;
}

.card-footer {
  min-height: 56rpx;
}

.thumb {
  width: 72rpx;
  height: 72rpx;
  border-radius: 6rpx;
}

.edit-button {
  margin: 0 0 0 auto;
  color: $primary-color;
  background: #e6f7ff;
}

.empty,
.list-tip {
  padding: 80rpx 0;
  font-size: 26rpx;
  color: #999;
  text-align: center;
}

.list-tip {
  padding: 24rpx 0;
}

.create-button {
  position: fixed;
  right: 32rpx;
  bottom: 44rpx;
  width: 96rpx;
  height: 96rpx;
  padding: 0;
  font-size: 56rpx;
  line-height: 92rpx;
  color: #fff;
  background: $primary-color;
  border-radius: 50%;
  box-shadow: 0 8rpx 24rpx rgb(24 144 255 / 35%);
}
</style>
