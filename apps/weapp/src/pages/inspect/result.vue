<script setup lang="ts">
import { ref } from 'vue';

import { closeInspection, getTaskDetail } from '@/api/inspection';
import { uploadFile } from '@/api/request';
import { onLoad } from '@dcloudio/uni-app';

interface InspectionItem {
  checkItem: string;
  standardValue: string;
  measuredValue: string;
  result: '' | 'FAIL' | 'PASS';
}

interface TaskInfo {
  workOrderNumber: string;
  partName: string;
}

const taskId = ref('');
const task = ref<null | TaskInfo>(null);
const inspectionItems = ref<InspectionItem[]>([]);
const photoUrls = ref<string[]>([]);
const remarks = ref('');
const submitting = ref(false);

async function fetchDetail() {
  try {
    const res = await getTaskDetail(taskId.value);
    if (res.code === 0) {
      const data = res.data as Record<string, unknown>;
      task.value = {
        workOrderNumber: data.workOrderNumber as string,
        partName: data.partName as string,
      };
      const template =
        (data.inspectionTemplate as InspectionItem[] | null) ?? [];
      inspectionItems.value = template.map((t) => ({
        checkItem: t.checkItem,
        standardValue: t.standardValue,
        measuredValue: '',
        result: '',
      }));
      if (inspectionItems.value.length === 0) {
        inspectionItems.value = [
          {
            checkItem: '综合检验',
            standardValue: '—',
            measuredValue: '',
            result: '',
          },
        ];
      }
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch {
    uni.showToast({ title: '网络错误', icon: 'none' });
  }
}

function onMeasuredInput(e: { detail: { value: string } }, idx: number) {
  inspectionItems.value[idx].measuredValue = e.detail.value;
}

function setResult(idx: number, result: 'FAIL' | 'PASS') {
  inspectionItems.value[idx].result = result;
}

function removePhoto(idx: number) {
  photoUrls.value.splice(idx, 1);
}

function choosePhoto() {
  uni.chooseImage({
    count: 9 - photoUrls.value.length,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: async (res) => {
      uni.showLoading({ title: '上传中...' });
      try {
        for (const path of res.tempFilePaths) {
          const url = await uploadFile(path);
          photoUrls.value.push(url);
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
  const unfilled = inspectionItems.value.filter(
    (i) => !i.measuredValue || !i.result,
  );
  if (unfilled.length > 0) {
    uni.showToast({ title: '请填写所有检验项', icon: 'none' });
    return;
  }
  submitting.value = true;
  uni.showLoading({ title: '提交中...' });
  try {
    const res = await closeInspection(taskId.value, {
      inspectionItems: inspectionItems.value,
      photos: photoUrls.value,
      remarks: remarks.value,
    });
    if (res.code === 0) {
      uni.hideLoading();
      uni.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => {
        uni.navigateBack();
      }, 1500);
    } else {
      uni.hideLoading();
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
    <!-- Header -->
    <view v-if="task" class="task-header">
      <text class="work-order">{{ task.workOrderNumber }}</text>
      <text class="part-name">{{ task.partName }}</text>
    </view>

    <scroll-view scroll-y class="scroll" :style="{ paddingBottom: '160rpx' }">
      <!-- Inspection Items -->
      <view class="card">
        <view class="section-title">检验项目</view>
        <view
          v-for="(item, idx) in inspectionItems"
          :key="idx"
          class="inspect-item"
        >
          <view class="item-header">
            <text class="item-label">{{ item.checkItem }}</text>
            <text class="item-standard">标准值：{{ item.standardValue }}</text>
          </view>
          <view class="item-inputs">
            <input
              class="measured-input"
              :value="item.measuredValue"
              placeholder="请输入实测值"
              @input="(e) => onMeasuredInput(e, idx)"
            />
            <view class="result-toggle">
              <view
                class="toggle-btn"
                :class="{ selected: item.result === 'PASS' }"
                @tap="setResult(idx, 'PASS')"
              >
                <text>合格</text>
              </view>
              <view
                class="toggle-btn fail"
                :class="{ selected: item.result === 'FAIL' }"
                @tap="setResult(idx, 'FAIL')"
              >
                <text>不合格</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- Photo Upload -->
      <view class="card">
        <view class="section-title">现场照片（最多9张）</view>
        <view class="photo-grid">
          <view v-for="(url, idx) in photoUrls" :key="idx" class="photo-item">
            <image :src="url" class="photo-img" mode="aspectFill" />
            <view class="photo-delete" @tap="removePhoto(idx)">
              <text class="delete-icon">×</text>
            </view>
          </view>
          <view
            v-if="photoUrls.length < 9"
            class="photo-add"
            @tap="choosePhoto"
          >
            <text class="add-icon">+</text>
          </view>
        </view>
      </view>

      <!-- Remarks -->
      <view class="card">
        <view class="section-title">备注</view>
        <textarea
          class="remarks-input"
          v-model="remarks"
          placeholder="请输入备注信息（选填）"
          :maxlength="500"
          auto-height
        ></textarea>
      </view>
    </scroll-view>

    <!-- Submit Button -->
    <view class="action-bar">
      <button
        class="btn btn-primary"
        :loading="submitting"
        :disabled="submitting"
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

.task-header {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 8rpx;
  padding: 24rpx 32rpx;
  background: #1890ff;

  .work-order {
    font-size: 32rpx;
    font-weight: 600;
    color: #fff;
  }

  .part-name {
    font-size: 26rpx;
    color: rgb(255 255 255 / 80%);
  }
}

.scroll {
  flex: 1;
  padding: 20rpx;
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

.inspect-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f5f5f5;

  &:last-child {
    border-bottom: none;
  }
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;

  .item-label {
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
  }

  .item-standard {
    font-size: 24rpx;
    color: #999;
  }
}

.item-inputs {
  display: flex;
  gap: 16rpx;
  align-items: center;
}

.measured-input {
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f9f9f9;
  border: 1rpx solid #e8e8e8;
  border-radius: 8rpx;
}

.result-toggle {
  display: flex;
  overflow: hidden;
  border: 1rpx solid #e8e8e8;
  border-radius: 8rpx;
}

.toggle-btn {
  padding: 16rpx 24rpx;
  font-size: 26rpx;
  color: #999;
  background: #fff;

  &.selected {
    color: #fff;
    background: #52c41a;
  }

  &.fail.selected {
    color: #fff;
    background: #f5222d;
  }
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
  width: 40rpx;
  height: 40rpx;
  background: rgb(0 0 0 / 60%);
  border-radius: 50%;

  .delete-icon {
    font-size: 28rpx;
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

.remarks-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 160rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #333;
  background: #f9f9f9;
  border-radius: 8rpx;
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
