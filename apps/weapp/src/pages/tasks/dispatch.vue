<script setup lang="ts">
import { ref } from 'vue';

import {
  dispatchInspectionRequest,
  getInspectionRequest,
  getUserList,
} from '@/api/inspection';
import { buildResourceUrl } from '@/api/request';
import { onLoad } from '@dcloudio/uni-app';

interface TaskInfo {
  requestNo: string;
  workOrderNumber: string;
  partName: string;
  processName: string;
  reporter: string;
  attachments: Array<{ name: string; url: string }>;
}

interface InspectorOption {
  id: string;
  label: string;
  activeTaskCount: number;
}

const taskId = ref('');
const task = ref<null | TaskInfo>(null);
const inspectors = ref<InspectorOption[]>([]);
const loading = ref(false);
const submitting = ref(false);

// Form state
const selectedInspectorIndex = ref(-1);
const priority = ref(3);
const dispatchRemark = ref('');

const inspectorNames = ref<string[]>([]);

async function loadData(id: string) {
  loading.value = true;
  uni.showLoading({ title: '加载中...' });
  try {
    const [detailRes, usersRes] = await Promise.all([
      getInspectionRequest(id),
      getUserList({ page: 1, pageSize: 100 }),
    ]);
    if (detailRes.code === 0) {
      const d = detailRes.data as Record<string, unknown>;
      const rawAttachments = Array.isArray(d.attachments) ? d.attachments : [];
      task.value = {
        requestNo: String(d.requestNo ?? ''),
        workOrderNumber: String(d.workOrderNumber ?? ''),
        partName: String(d.partName ?? ''),
        processName: String(d.processName ?? ''),
        reporter: String(d.reporter ?? ''),
        attachments: rawAttachments.map((a: unknown) => {
          if (typeof a === 'string')
            return { name: a.split('/').pop() ?? '附件', url: a };
          const obj = a as Record<string, string>;
          return {
            name: obj.name || obj.url?.split('/').pop() || '附件',
            url: obj.url || '',
          };
        }),
      };
    } else {
      uni.showToast({ title: detailRes.message || '加载失败', icon: 'none' });
    }
    if (usersRes.code === 0) {
      inspectors.value = (usersRes.data.items ?? []).map((u) => ({
        id: u.id,
        label: u.realName || u.username,
        activeTaskCount:
          ((u as Record<string, unknown>).activeTaskCount as number) ?? 0,
      }));
      inspectorNames.value = inspectors.value.map((i) => {
        if (i.activeTaskCount === 0) return `${i.label} (空闲)`;
        return `${i.label} (${i.activeTaskCount}条任务)`;
      });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
    uni.hideLoading();
  }
}

function onPickerChange(e: { detail: { value: number } }) {
  selectedInspectorIndex.value = Number(e.detail.value);
}

function onRemarkInput(e: { detail: { value: string } }) {
  dispatchRemark.value = e.detail.value;
}

function getFullUrl(url: string) {
  return buildResourceUrl(url);
}

function previewImage(url: string) {
  const fullUrl = getFullUrl(url);
  const allUrls = (task.value?.attachments ?? []).map((a) => getFullUrl(a.url));
  uni.previewImage({ urls: allUrls, current: fullUrl });
}

async function submitDispatch() {
  if (selectedInspectorIndex.value < 0) {
    uni.showToast({ title: '请选择检验员', icon: 'none' });
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  uni.showLoading({ title: '派单中...' });
  try {
    const inspector = inspectors.value[selectedInspectorIndex.value];
    const payload: {
      dispatchRemark?: string;
      inspectorId: string;
      priority: number;
    } = {
      inspectorId: inspector.id,
      priority: priority.value,
    };
    if (dispatchRemark.value.trim()) {
      payload.dispatchRemark = dispatchRemark.value.trim();
    }
    const res = await dispatchInspectionRequest(taskId.value, payload);
    uni.hideLoading();
    if (res.code === 0) {
      uni.showToast({ title: '派单成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1200);
    } else {
      uni.showToast({ title: res.message || '派单失败', icon: 'none' });
      submitting.value = false;
    }
  } catch {
    uni.hideLoading();
    uni.showToast({ title: '网络错误', icon: 'none' });
    submitting.value = false;
  }
}

onLoad((options) => {
  taskId.value = options?.id ?? '';
  if (taskId.value) {
    loadData(taskId.value);
  }
});
</script>

<template>
  <view class="page">
    <scroll-view scroll-y class="scroll">
      <!-- Task info card -->
      <view v-if="task" class="card info-card">
        <view class="section-title">任务信息</view>
        <view class="info-row">
          <text class="info-label">编号</text>
          <text class="info-value request-no">{{ task.requestNo }}</text>
        </view>
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
        <view class="info-row">
          <text class="info-label">报检人</text>
          <text class="info-value">{{ task.reporter }}</text>
        </view>

        <!-- Attachments -->
        <view v-if="task.attachments.length > 0" class="attachments-section">
          <text class="info-label">报检附件</text>
          <view class="attachment-grid">
            <image
              v-for="(att, idx) in task.attachments"
              :key="idx"
              class="attachment-img"
              :src="getFullUrl(att.url)"
              mode="aspectFill"
              @tap="previewImage(att.url)"
            />
          </view>
        </view>
      </view>

      <!-- Loading placeholder -->
      <view v-if="loading" class="loading-wrap">
        <text class="loading-text">加载中...</text>
      </view>

      <!-- Dispatch form card -->
      <view class="card form-card">
        <view class="section-title">派单信息</view>

        <!-- Inspector picker -->
        <view class="form-item">
          <text class="form-label">
            检验员
            <text class="required">*</text>
          </text>
          <picker
            :value="selectedInspectorIndex"
            :range="inspectorNames"
            @change="onPickerChange"
          >
            <view
              class="picker-trigger"
              :class="{ placeholder: selectedInspectorIndex < 0 }"
            >
              <text>
                {{
                  selectedInspectorIndex >= 0
                    ? inspectorNames[selectedInspectorIndex]
                    : '请选择检验员'
                }}
              </text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- Priority input -->
        <view class="form-item">
          <text class="form-label">优先级（1-5）</text>
          <view class="priority-row">
            <view
              v-for="n in 5"
              :key="n"
              class="priority-btn"
              :class="{
                'priority-btn-active': priority === n,
                [`level-${n}`]: priority === n,
              }"
              @tap="priority = n"
            >
              <text>{{ n }}</text>
            </view>
          </view>
        </view>

        <!-- Remark textarea -->
        <view class="form-item">
          <text class="form-label">备注（选填）</text>
          <textarea
            class="remark-input"
            :value="dispatchRemark"
            placeholder="请输入派单备注"
            :maxlength="200"
            auto-height
            @input="onRemarkInput"
          ></textarea>
          <text class="char-count">{{ dispatchRemark.length }}/200</text>
        </view>
      </view>
    </scroll-view>

    <!-- Submit bar -->
    <view class="action-bar">
      <button
        class="btn btn-primary"
        :loading="submitting"
        :disabled="submitting || selectedInspectorIndex < 0"
        @tap="submitDispatch"
      >
        确认派单
      </button>
    </view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: $bg-color;
}

.scroll {
  flex: 1;
  padding: 20rpx;
  padding-bottom: 160rpx;
  overflow: hidden;
}

.loading-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;

  .loading-text {
    font-size: 28rpx;
    color: #bbb;
  }
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
  color: $text-color;
  border-bottom: 1rpx solid #f0f0f0;
}

.info-row {
  display: flex;
  align-items: flex-start;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #fafafa;

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  flex-shrink: 0;
  width: 120rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
}

.info-value {
  flex: 1;
  font-size: 26rpx;
  color: $text-color;
}

.attachments-section {
  padding-top: 16rpx;
  margin-top: 12rpx;
  border-top: 1rpx solid #f0f0f0;
}

.attachment-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.attachment-img {
  width: 160rpx;
  height: 160rpx;
  background: #f5f5f5;
  border-radius: 8rpx;
}

.request-no {
  font-weight: 600;
  color: $primary-color;
}

.form-item {
  margin-bottom: 36rpx;

  &:last-child {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: $text-color;

  .required {
    margin-left: 4rpx;
    color: #f5222d;
  }
}

.picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: $text-color;
  background: #f9f9f9;
  border: 1rpx solid $border-color;
  border-radius: 12rpx;

  &.placeholder {
    color: #bbb;
  }

  .picker-arrow {
    display: inline-block;
    font-size: 36rpx;
    color: #bbb;
    transform: rotate(90deg);
  }
}

.priority-row {
  display: flex;
  gap: 16rpx;
}

.priority-btn {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  font-size: 30rpx;
  color: $text-color-secondary;
  background: #f5f5f5;
  border: 2rpx solid transparent;
  border-radius: 10rpx;

  &.priority-btn-active {
    font-weight: 600;
    border-color: currentcolor;
  }

  &.level-1 {
    color: #f5222d;
    background: #fff1f0;
  }

  &.level-2 {
    color: #fa8c16;
    background: #fff7e6;
  }

  &.level-3 {
    color: $primary-color;
    background: #e6f7ff;
  }

  &.level-4 {
    color: $success-color;
    background: #f6ffed;
  }

  &.level-5 {
    color: #999;
    background: #fafafa;
  }
}

.remark-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 160rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: $text-color;
  background: #f9f9f9;
  border: 1rpx solid $border-color;
  border-radius: 12rpx;
}

.char-count {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #bbb;
  text-align: right;
}

.action-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid $border-color;
}

.btn {
  width: 100%;
  height: 88rpx;
  font-size: 32rpx;
  border: none;
  border-radius: 44rpx;

  &.btn-primary {
    color: #fff;
    background: $primary-color;
  }

  &[disabled] {
    opacity: 0.5;
  }
}
</style>
