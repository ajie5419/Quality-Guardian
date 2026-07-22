<script setup lang="ts">
import type { InspectionIssueRecord } from '@/api/issues';

import { computed, ref } from 'vue';

import { deleteInspectionIssue, getInspectionIssue } from '@/api/issues';
import { buildResourceUrl } from '@/api/request';
import { useUserStore } from '@/stores/user';
import {
  formatDepartmentNames,
  loadDepartmentNameMap,
} from '@/utils/departments';
import {
  canManageInspectionIssue,
  getIssueSeverityLabel,
  getIssueStatusLabel,
} from '@/utils/issues';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { INSPECTION_ISSUE_PERMISSION_CODES } from '@qgs/shared';

const userStore = useUserStore();
const issueId = ref('');
const issue = ref<InspectionIssueRecord | null>(null);
const loading = ref(false);
const departmentNames = ref(new Map<string, string>());
const errorMessage = ref('');

const canEdit = computed(() =>
  Boolean(
    issue.value &&
      userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.EDIT) &&
      canManageInspectionIssue(issue.value, userStore.userInfo),
  ),
);
const canDelete = computed(() =>
  Boolean(
    issue.value &&
      userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.DELETE) &&
      canManageInspectionIssue(issue.value, userStore.userInfo),
  ),
);

async function loadIssue() {
  if (!issueId.value || loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await getInspectionIssue(issueId.value);
    if (res.code === 0 && res.data) {
      issue.value = res.data;
    } else {
      errorMessage.value = res.message || '记录加载失败';
    }
  } catch {
    errorMessage.value = '网络错误，记录加载失败';
  } finally {
    loading.value = false;
  }
}

function displayDepartments() {
  if (!issue.value) return '-';
  return formatDepartmentNames(
    departmentNames.value,
    issue.value.responsibleDepartments,
    issue.value.responsibleDepartment,
  );
}

function previewPhoto(photo: string) {
  if (!issue.value) return;
  uni.previewImage({
    current: buildResourceUrl(photo),
    urls: issue.value.photos.map((item) => buildResourceUrl(item)),
  });
}

function editIssue() {
  if (!issue.value || !canEdit.value) return;
  uni.navigateTo({ url: `/pages/issues/edit?id=${issue.value.id}` });
}

function deleteIssue() {
  if (!issue.value || !canDelete.value) return;
  uni.showModal({
    title: '删除不合格品项',
    content: `确定删除 ${issue.value.ncNumber || issue.value.partName}？`,
    success: (result) => {
      if (result.confirm) void performDelete();
    },
  });
}

async function performDelete() {
  if (!issue.value) return;
  try {
    const res = await deleteInspectionIssue(issue.value.id);
    if (res.code !== 0) {
      uni.showToast({ title: res.message || '删除失败', icon: 'none' });
      return;
    }
    uni.showToast({ title: '删除成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 600);
  } catch {
    uni.showToast({ title: '网络错误，删除失败', icon: 'none' });
  }
}

onLoad(async (options) => {
  if (!userStore.checkAuth()) return;
  await userStore.loadPermissionCodes();
  if (!userStore.hasPermission(INSPECTION_ISSUE_PERMISSION_CODES.VIEW)) {
    uni.showToast({ title: '无权查看不合格品项', icon: 'none' });
    setTimeout(() => uni.navigateBack(), 800);
    return;
  }
  issueId.value = options?.id || '';
  departmentNames.value = await loadDepartmentNameMap();
  await loadIssue();
});

onShow(() => {
  if (issueId.value) void loadIssue();
});
</script>

<template>
  <view class="page">
    <view v-if="loading && !issue" class="loading">加载中...</view>
    <view v-else-if="errorMessage && !issue" class="error-state">
      <text>{{ errorMessage }}</text>
      <view class="error-actions">
        <button @tap="loadIssue">重试</button>
        <button @tap="uni.navigateBack()">返回</button>
      </view>
    </view>
    <template v-else-if="issue">
      <scroll-view scroll-y class="detail-scroll">
        <view class="summary-card">
          <view>
            <text class="nc-number">{{ issue.ncNumber || '-' }}</text>
            <text class="part-name">{{ issue.partName || '-' }}</text>
          </view>
          <view class="status-tag">{{
            getIssueStatusLabel(String(issue.status))
          }}</view>
        </view>

        <view class="detail-card">
          <text class="section-title">基本信息</text>
          <view class="detail-row"
            ><text>发现日期</text
            ><text>{{ issue.reportDate || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>工单号</text
            ><text>{{ issue.workOrderNumber || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>项目名称</text
            ><text>{{ issue.projectName || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>工序</text><text>{{ issue.processName || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>数量</text><text>{{ issue.quantity ?? 0 }}</text></view
          >
          <view class="detail-row"
            ><text>检验员</text><text>{{ issue.inspector || '-' }}</text></view
          >
        </view>

        <view class="detail-card">
          <text class="section-title">责任与分类</text>
          <view class="detail-row">
            <text>责任部门</text>
            <text>{{ displayDepartments() }}</text>
          </view>
          <view class="detail-row"
            ><text>责任单位</text
            ><text>{{ issue.supplierName || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>责任焊工</text
            ><text>{{ issue.responsibleWelder || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>严重程度</text
            ><text>{{
              getIssueSeverityLabel(String(issue.severity))
            }}</text></view
          >
          <view class="detail-row"
            ><text>缺陷分类</text
            ><text>{{ issue.defectType || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>缺陷子类</text
            ><text>{{ issue.defectSubtype || '-' }}</text></view
          >
          <view class="detail-row"
            ><text>损失金额</text><text>{{ issue.lossAmount ?? 0 }}</text></view
          >
          <view class="detail-row"
            ><text>是否索赔</text
            ><text>{{ issue.claim === 'Yes' ? '是' : '否' }}</text></view
          >
        </view>

        <view class="detail-card">
          <text class="section-title">分析与措施</text>
          <view class="text-block"
            ><text>不合格描述</text
            ><text>{{ issue.description || '-' }}</text></view
          >
          <view class="text-block"
            ><text>原因分析</text
            ><text>{{ issue.rootCause || '-' }}</text></view
          >
          <view class="text-block"
            ><text>解决方案</text><text>{{ issue.solution || '-' }}</text></view
          >
        </view>

        <view v-if="issue.photos.length > 0" class="detail-card">
          <text class="section-title">问题照片</text>
          <view class="photo-grid">
            <image
              v-for="photo in issue.photos"
              :key="photo"
              class="photo"
              :src="buildResourceUrl(photo)"
              mode="aspectFill"
              @tap="previewPhoto(photo)"
            />
          </view>
        </view>
      </scroll-view>

      <view v-if="canEdit || canDelete" class="bottom-actions">
        <button v-if="canEdit" class="edit-button" @tap="editIssue">
          编辑
        </button>
        <button v-if="canDelete" class="delete-button" @tap="deleteIssue">
          删除
        </button>
      </view>
    </template>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg-color;
}

.detail-scroll {
  flex: 1;
  overflow: hidden;
}

.loading {
  padding: 120rpx 0;
  font-size: 26rpx;
  color: $text-color-secondary;
  text-align: center;
}

.error-state {
  padding: 120rpx 40rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
  text-align: center;
}

.error-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;

  button {
    flex: 1;
    font-size: 26rpx;
  }
}

.summary-card,
.detail-card {
  padding: 28rpx;
  margin: 20rpx;
  background: #fff;
  border-radius: 12rpx;
}

.summary-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.nc-number {
  display: block;
  font-size: 34rpx;
  font-weight: 600;
  color: $text-color;
}

.part-name {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
}

.status-tag {
  padding: 8rpx 16rpx;
  font-size: 24rpx;
  color: $primary-color;
  background: #e6f7ff;
  border-radius: 6rpx;
}

.section-title {
  display: block;
  padding-bottom: 18rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: $text-color;
  border-bottom: 1rpx solid #f0f0f0;
}

.detail-row {
  display: flex;
  gap: 24rpx;
  justify-content: space-between;
  padding: 16rpx 0;
  font-size: 26rpx;
  color: $text-color;

  text:first-child {
    flex-shrink: 0;
    color: $text-color-secondary;
  }

  text:last-child {
    text-align: right;
  }
}

.text-block {
  padding: 18rpx 0;
  font-size: 26rpx;

  text:first-child {
    display: block;
    margin-bottom: 10rpx;
    color: $text-color-secondary;
  }

  text:last-child {
    line-height: 1.6;
    color: $text-color;
  }
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;
  margin-top: 20rpx;
}

.photo {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8rpx;
}

.bottom-actions {
  display: flex;
  flex-shrink: 0;
  gap: 20rpx;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid $border-color;
}

.edit-button {
  flex: 1;
  height: 84rpx;
  font-size: 28rpx;
  line-height: 84rpx;
  color: #fff;
  background: $primary-color;
  border-radius: 8rpx;
}

.delete-button {
  flex: 1;
  height: 84rpx;
  font-size: 28rpx;
  line-height: 84rpx;
  color: $error-color;
  background: #fff;
  border: 1rpx solid $error-color;
  border-radius: 8rpx;
}
</style>
