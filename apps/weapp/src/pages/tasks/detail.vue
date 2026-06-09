<script setup lang="ts">
import { computed, ref } from 'vue';

import { dispatchTask, getTaskDetail } from '@/api/inspection';
import { useUserStore } from '@/stores/user';
import { onLoad } from '@dcloudio/uni-app';

interface TaskDetail {
  id: string;
  workOrderNumber: string;
  processName: string;
  partName: string;
  quantity: number;
  reporterName: string;
  teamName: string;
  status: string;
  inspectorId: string;
  attachments: string[];
}

interface InspectorOption {
  label: string;
  value: string;
}

const userStore = useUserStore();
const taskId = ref('');
const task = ref<null | TaskDetail>(null);
const loading = ref(false);
const actionLoading = ref(false);
const dispatchVisible = ref(false);
const selectedInspectorIndex = ref(-1);

// In a real app these would come from a users API; static fallback for now
const inspectorOptions = ref<InspectorOption[]>([]);

const isDispatcher = computed(() => {
  const roles = userStore.userInfo?.roles ?? [];
  return roles.some(
    (r) => r === 'dispatcher' || r === 'super' || r === 'admin',
  );
});

const isAssignedInspector = computed(
  () => task.value?.inspectorId === userStore.userInfo?.id,
);

const statusSteps = [
  { value: 'SUBMITTED', label: '待派单' },
  { value: 'DISPATCHED', label: '待检验' },
  { value: 'INSPECTING', label: '检验中' },
  { value: 'CLOSED', label: '已完成' },
];

const statusOrder = ['SUBMITTED', 'DISPATCHED', 'INSPECTING', 'CLOSED'];

function isStepActive(stepValue: string) {
  const currentIdx = statusOrder.indexOf(task.value?.status ?? '');
  const stepIdx = statusOrder.indexOf(stepValue);
  return stepIdx <= currentIdx;
}

async function fetchDetail() {
  loading.value = true;
  try {
    const res = await getTaskDetail(taskId.value);
    if (res.code === 0) {
      task.value = res.data as TaskDetail;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function showDispatchModal() {
  dispatchVisible.value = true;
}

function onPickerChange(e: { detail: { value: number } }) {
  selectedInspectorIndex.value = e.detail.value;
}

async function confirmDispatch() {
  if (selectedInspectorIndex.value < 0) {
    uni.showToast({ title: '请选择检验员', icon: 'none' });
    return;
  }
  actionLoading.value = true;
  try {
    const inspector = inspectorOptions.value[selectedInspectorIndex.value];
    const res = await dispatchTask(taskId.value, {
      inspectorId: inspector.value,
    });
    if (res.code === 0) {
      uni.showToast({ title: '派单成功', icon: 'success' });
      dispatchVisible.value = false;
      fetchDetail();
    } else {
      uni.showToast({ title: res.message || '派单失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    actionLoading.value = false;
  }
}

function goInspect() {
  uni.navigateTo({ url: `/pages/inspect/result?id=${taskId.value}` });
}

function getFileName(url: unknown) {
  if (typeof url !== 'string') return '附件';
  return url.split('/').pop() ?? url;
}

function previewFile(url: unknown) {
  if (typeof url !== 'string') return;
  uni.previewImage({ urls: [url], current: url });
}

onLoad((options) => {
  taskId.value = options?.id ?? '';
  fetchDetail();
});
</script>

<template>
  <view class="page">
    <view v-if="loading" class="loading-wrap">
      <text class="loading-text">加载中...</text>
    </view>

    <scroll-view v-else-if="task" scroll-y class="scroll">
      <!-- Info Card -->
      <view class="card">
        <view class="section-title">任务信息</view>
        <view class="info-row">
          <text class="label">工单号</text>
          <text class="value">{{ task.workOrderNumber }}</text>
        </view>
        <view class="info-row">
          <text class="label">工序名称</text>
          <text class="value">{{ task.processName }}</text>
        </view>
        <view class="info-row">
          <text class="label">零件名称</text>
          <text class="value">{{ task.partName }}</text>
        </view>
        <view class="info-row">
          <text class="label">数量</text>
          <text class="value">{{ task.quantity }}</text>
        </view>
        <view class="info-row">
          <text class="label">报检人</text>
          <text class="value">{{ task.reporterName }}</text>
        </view>
        <view class="info-row">
          <text class="label">班组</text>
          <text class="value">{{ task.teamName }}</text>
        </view>
      </view>

      <!-- Status Timeline -->
      <view class="card">
        <view class="section-title">状态</view>
        <view class="status-timeline">
          <view
            v-for="step in statusSteps"
            :key="step.value"
            class="step"
            :class="{
              active: isStepActive(step.value),
              current: task.status === step.value,
            }"
          >
            <view class="step-dot" />
            <text class="step-label">{{ step.label }}</text>
          </view>
        </view>
      </view>

      <!-- Attachments -->
      <view v-if="task.attachments && task.attachments.length > 0" class="card">
        <view class="section-title">附件</view>
        <view class="attachment-list">
          <view
            v-for="(file, idx) in task.attachments"
            :key="idx"
            class="attachment-item"
            @tap="previewFile(file)"
          >
            <text class="attachment-name">{{ getFileName(file) }}</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- Action Buttons -->
    <view v-if="task" class="action-bar">
      <button
        v-if="task.status === 'SUBMITTED' && isDispatcher"
        class="btn btn-primary"
        :loading="actionLoading"
        @tap="showDispatchModal"
      >
        派单
      </button>
      <button
        v-if="task.status === 'DISPATCHED' && isAssignedInspector"
        class="btn btn-primary"
        @tap="goInspect"
      >
        开始检验
      </button>
    </view>

    <!-- Dispatch Modal -->
    <view
      v-if="dispatchVisible"
      class="modal-mask"
      @tap.self="dispatchVisible = false"
    >
      <view class="modal">
        <view class="modal-title">选择检验员</view>
        <picker
          :value="selectedInspectorIndex"
          :range="inspectorOptions"
          range-key="label"
          @change="onPickerChange"
        >
          <view class="picker-row">
            <text class="picker-value">
              {{
                selectedInspectorIndex >= 0
                  ? inspectorOptions[selectedInspectorIndex]?.label
                  : '请选择检验员'
              }}
            </text>
          </view>
        </picker>
        <view class="modal-actions">
          <button class="btn btn-default" @tap="dispatchVisible = false">
            取消
          </button>
          <button
            class="btn btn-primary"
            :loading="actionLoading"
            @tap="confirmDispatch"
          >
            确认派单
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
}

.loading-wrap {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;

  .loading-text {
    font-size: 28rpx;
    color: #999;
  }
}

.scroll {
  flex: 1;
  padding: 20rpx;
  padding-bottom: 160rpx;
  overflow: hidden;
}

.card {
  padding: 28rpx;
  margin-bottom: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.section-title {
  padding-bottom: 16rpx;
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #333;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row {
  display: flex;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f9f9f9;

  &:last-child {
    border-bottom: none;
  }
}

.label {
  flex-shrink: 0;
  width: 160rpx;
  font-size: 28rpx;
  color: #999;
}

.value {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}

.status-timeline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16rpx 0;
}

.step {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;

  &:not(:last-child)::after {
    position: absolute;
    top: 14rpx;
    left: 60%;
    width: 80%;
    height: 4rpx;
    content: '';
    background: #e0e0e0;
  }

  &.active:not(:last-child)::after {
    background: #1890ff;
  }
}

.step-dot {
  width: 28rpx;
  height: 28rpx;
  margin-bottom: 12rpx;
  background: #e0e0e0;
  border-radius: 50%;

  .active & {
    background: #1890ff;
  }

  .current & {
    background: #1890ff;
    box-shadow: 0 0 0 6rpx rgb(24 144 255 / 20%);
  }
}

.step-label {
  font-size: 22rpx;
  color: #999;

  .active & {
    color: #1890ff;
  }
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.attachment-item {
  padding: 16rpx;
  background: #f9f9f9;
  border-radius: 8rpx;

  .attachment-name {
    font-size: 26rpx;
    color: #1890ff;
  }
}

.action-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  gap: 20rpx;
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #eee;
}

.btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  font-size: 30rpx;
  border: none;
  border-radius: 44rpx;

  &.btn-primary {
    color: #fff;
    background: #1890ff;
  }

  &.btn-default {
    color: #666;
    background: #f5f5f5;
  }
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-end;
  background: rgb(0 0 0 / 50%);
}

.modal {
  width: 100%;
  padding: 40rpx 32rpx;
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
}

.modal-title {
  margin-bottom: 32rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #333;
  text-align: center;
}

.picker-row {
  padding: 24rpx 20rpx;
  margin-bottom: 32rpx;
  background: #f5f5f5;
  border-radius: 12rpx;

  .picker-value {
    font-size: 28rpx;
    color: #333;
  }
}

.modal-actions {
  display: flex;
  gap: 20rpx;
}
</style>
