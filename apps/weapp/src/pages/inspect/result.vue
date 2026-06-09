<script setup lang="ts">
import { ref } from 'vue';

import { closeInspectionRequest, getInspectionRequest } from '@/api/inspection';
import { uploadFile } from '@/api/request';
import { onLoad } from '@dcloudio/uni-app';

interface TaskDetail {
  requestNo: string;
  workOrderNumber: string;
  partName: string;
  processName: string;
  quantity: number;
}

interface Attachment {
  name: string;
  url: string;
}

const taskId = ref('');
const task = ref<null | TaskDetail>(null);
const loading = ref(false);
const submitting = ref(false);

// Form state
const result = ref<'FAIL' | 'PASS'>('PASS');
const hasDocuments = ref(true);
const closeRemark = ref('');
const attachments = ref<Attachment[]>([]);

async function fetchDetail() {
  loading.value = true;
  try {
    const res = await getInspectionRequest(taskId.value);
    if (res.code === 0) {
      const data = res.data as Record<string, unknown>;
      task.value = {
        requestNo: (data.requestNo as string) || '',
        workOrderNumber: (data.workOrderNumber as string) || '',
        partName: (data.partName as string) || '',
        processName: (data.processName as string) || '',
        quantity: (data.quantity as number) || 1,
      };
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function setResult(val: 'FAIL' | 'PASS') {
  result.value = val;
  if (val === 'PASS') {
    attachments.value = [];
  }
}

function removeAttachment(idx: number) {
  attachments.value.splice(idx, 1);
}

function choosePhoto() {
  const remaining = 3 - attachments.value.length;
  if (remaining <= 0) return;

  uni.chooseImage({
    count: remaining,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: async (res) => {
      uni.showLoading({ title: '上传中...' });
      try {
        for (const path of res.tempFilePaths) {
          const uploadRes = await uploadFile(path);
          if (uploadRes.code === 0 && uploadRes.data?.url) {
            const fileName = path.split('/').pop() || 'photo.jpg';
            attachments.value.push({ url: uploadRes.data.url, name: fileName });
          } else {
            uni.showToast({ title: '上传失败', icon: 'none' });
          }
        }
      } catch {
        uni.showToast({ title: '上传失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    },
  });
}

async function submitResult() {
  if (!task.value || submitting.value) return;

  submitting.value = true;
  uni.showLoading({ title: '提交中...' });

  const quantity = task.value.quantity;

  try {
    const res = await closeInspectionRequest(taskId.value, {
      result: result.value,
      hasDocuments: hasDocuments.value,
      closeRemark: closeRemark.value || undefined,
      attachments: result.value === 'FAIL' ? attachments.value : undefined,
      quantity,
      qualifiedQuantity: result.value === 'PASS' ? quantity : 0,
      unqualifiedQuantity: result.value === 'FAIL' ? quantity : 0,
    });

    uni.hideLoading();

    if (res.code === 0) {
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      uni.showToast({ title: res.message || '提交失败', icon: 'none' });
    }
  } catch {
    uni.hideLoading();
    uni.showToast({ title: '网络错误', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onLoad((options) => {
  taskId.value = options?.id ?? '';
  fetchDetail();
});
</script>

<template>
  <view class="page">
    <!-- Detail section -->
    <view v-if="task" class="detail-card">
      <view class="detail-row">
        <text class="detail-label">编号</text>
        <text class="detail-value">{{ task.requestNo }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">工单号</text>
        <text class="detail-value">{{ task.workOrderNumber }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">零件</text>
        <text class="detail-value">{{ task.partName }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">工序</text>
        <text class="detail-value">{{ task.processName }}</text>
      </view>
      <view class="detail-row">
        <text class="detail-label">数量</text>
        <text class="detail-value">{{ task.quantity }}</text>
      </view>
    </view>

    <scroll-view scroll-y class="scroll">
      <!-- Result segmented control -->
      <view class="card">
        <view class="field-label required">检验结果</view>
        <view class="segmented">
          <view
            class="seg-btn"
            :class="{
              'seg-btn--pass': result === 'PASS',
              'seg-btn--active': result === 'PASS',
            }"
            @tap="setResult('PASS')"
          >
            <text>PASS</text>
          </view>
          <view
            class="seg-btn"
            :class="{
              'seg-btn--fail': result === 'FAIL',
              'seg-btn--active': result === 'FAIL',
            }"
            @tap="setResult('FAIL')"
          >
            <text>FAIL</text>
          </view>
        </view>
      </view>

      <!-- Has documents switch -->
      <view class="card">
        <view class="field-row">
          <text class="field-label required">是否有资料</text>
          <switch
            :checked="hasDocuments"
            color="#1890ff"
            @change="
              (e: { detail: { value: boolean } }) =>
                (hasDocuments = e.detail.value)
            "
          />
          <text class="switch-label">{{ hasDocuments ? '有' : '无' }}</text>
        </view>
      </view>

      <!-- Remark textarea -->
      <view class="card">
        <view class="field-label">备注</view>
        <textarea
          v-model="closeRemark"
          class="remark-input"
          placeholder="检验备注（选填）"
          :maxlength="300"
          auto-height
        ></textarea>
      </view>

      <!-- Photo upload — only shown when FAIL -->
      <view v-if="result === 'FAIL'" class="card">
        <view class="field-label">照片（最多3张）</view>
        <view class="photo-grid">
          <view v-for="(att, idx) in attachments" :key="idx" class="photo-item">
            <image :src="att.url" class="photo-img" mode="aspectFill" />
            <view class="photo-delete" @tap="removeAttachment(idx)">
              <text class="delete-icon">×</text>
            </view>
          </view>
          <view
            v-if="attachments.length < 3"
            class="photo-add"
            @tap="choosePhoto"
          >
            <text class="add-icon">+</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- Submit button -->
    <view class="action-bar">
      <button
        class="btn btn-primary"
        :loading="submitting"
        :disabled="submitting || loading"
        @tap="submitResult"
      >
        提交检验结果
      </button>
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

.detail-card {
  flex-shrink: 0;
  padding: 24rpx 32rpx;
  background: #1890ff;
}

.detail-row {
  display: flex;
  align-items: center;
  padding: 6rpx 0;

  .detail-label {
    width: 120rpx;
    font-size: 26rpx;
    color: rgb(255 255 255 / 70%);
  }

  .detail-value {
    flex: 1;
    font-size: 28rpx;
    color: #fff;
  }
}

.scroll {
  flex: 1;
  padding: 20rpx;
  overflow: hidden;
  padding-bottom: 160rpx;
}

.card {
  padding: 28rpx;
  margin-bottom: 20rpx;
  background: #fff;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgb(0 0 0 / 6%);
}

.field-label {
  margin-bottom: 16rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #333;

  &.required::before {
    margin-right: 6rpx;
    color: #f5222d;
    content: '*';
  }
}

.field-row {
  display: flex;
  gap: 16rpx;
  align-items: center;

  .field-label {
    flex: 1;
    margin-bottom: 0;
  }
}

.switch-label {
  font-size: 26rpx;
  color: #666;
}

.segmented {
  display: flex;
  overflow: hidden;
  border: 1rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.seg-btn {
  flex: 1;
  padding: 20rpx 0;
  font-size: 28rpx;
  color: #999;
  text-align: center;
  background: #fafafa;
  transition: background 0.2s;

  &--active {
    color: #fff;
  }

  &--pass {
    background: #52c41a;
  }

  &--fail {
    background: #f5222d;
  }
}

.remark-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 160rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f9f9f9;
  border-radius: 8rpx;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
}

.photo-img {
  width: 200rpx;
  height: 200rpx;
  object-fit: cover;
  border-radius: 12rpx;
}

.photo-delete {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  background: rgb(0 0 0 / 60%);
  border-radius: 50%;

  .delete-icon {
    font-size: 32rpx;
    line-height: 1;
    color: #fff;
  }
}

.photo-add {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200rpx;
  height: 200rpx;
  background: #fafafa;
  border: 2rpx dashed #d9d9d9;
  border-radius: 12rpx;

  .add-icon {
    font-size: 60rpx;
    color: #bbb;
  }
}

.action-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20rpx 32rpx;
  padding-bottom: calc(20rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid #eee;
}

.btn {
  width: 100%;
  height: 88rpx;
  font-size: 32rpx;
  border: none;
  border-radius: 44rpx;

  &.btn-primary {
    color: #fff;
    background: #1890ff;
  }

  &[disabled] {
    opacity: 0.6;
  }
}
</style>
