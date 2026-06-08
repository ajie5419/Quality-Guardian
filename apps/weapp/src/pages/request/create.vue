<script setup lang="ts">
import { reactive, ref } from 'vue';

import { submitInspectionRequest } from '@/api/inspection';
import { useUserStore } from '@/stores/user';
import { onLoad } from '@dcloudio/uni-app';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5320';

type Priority = 'HIGH' | 'NORMAL' | 'URGENT';

interface FormState {
  workOrderNumber: string;
  processName: string;
  partName: string;
  quantity: string;
  team: string;
  reporter: string;
  priority: Priority;
  description: string;
  attachments: string[];
}

interface FieldError {
  workOrderNumber: boolean;
  processName: boolean;
  partName: boolean;
  reporter: boolean;
}

const userStore = useUserStore();

const form = reactive<FormState>({
  workOrderNumber: '',
  processName: '',
  partName: '',
  quantity: '',
  team: '',
  reporter: '',
  priority: 'NORMAL',
  description: '',
  attachments: [],
});

const errors = reactive<FieldError>({
  workOrderNumber: false,
  processName: false,
  partName: false,
  reporter: false,
});

const submitting = ref(false);
const uploadingPhoto = ref(false);

const priorityOptions = ['普通', '高', '紧急'];
const priorityValues: Priority[] = ['NORMAL', 'HIGH', 'URGENT'];
const priorityIndex = ref(0);

onLoad(() => {
  userStore.checkAuth();
  if (userStore.userInfo?.realName) {
    form.reporter = userStore.userInfo.realName;
  }
});

function onPriorityChange(e: { detail: { value: string } }) {
  const idx = Number(e.detail.value);
  priorityIndex.value = idx;
  form.priority = priorityValues[idx];
}

function validate(): boolean {
  errors.workOrderNumber = !form.workOrderNumber.trim();
  errors.processName = !form.processName.trim();
  errors.partName = !form.partName.trim();
  errors.reporter = !form.reporter.trim();
  return (
    !errors.workOrderNumber &&
    !errors.processName &&
    !errors.partName &&
    !errors.reporter
  );
}

async function handleAddPhoto() {
  if (uploadingPhoto.value) return;
  if (form.attachments.length >= 6) {
    uni.showToast({ title: '最多上传6张图片', icon: 'none' });
    return;
  }
  const remaining = 6 - form.attachments.length;
  try {
    const res = await new Promise<UniApp.ChooseImageSuccessCallbackResult>(
      (resolve, reject) => {
        uni.chooseImage({
          count: remaining,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject,
        });
      },
    );
    uploadingPhoto.value = true;
    uni.showLoading({ title: '上传中...' });
    for (const path of res.tempFilePaths) {
      const uploadRes =
        await new Promise<UniApp.UploadFileSuccessCallbackResult>(
          (resolve, reject) => {
            uni.uploadFile({
              url: `${BASE_URL}/api/uploads`,
              filePath: path,
              name: 'file',
              header: {
                Authorization: `Bearer ${uni.getStorageSync('accessToken') || ''}`,
              },
              success: resolve,
              fail: reject,
            });
          },
        );
      const body = JSON.parse(uploadRes.data) as {
        code: number;
        data: { url: string };
      };
      if (body.code === 0 && body.data?.url) {
        form.attachments.push(body.data.url);
      }
    }
  } catch {
    uni.showToast({ title: '图片上传失败', icon: 'none' });
  } finally {
    uploadingPhoto.value = false;
    uni.hideLoading();
  }
}

function handleRemovePhoto(index: number) {
  form.attachments.splice(index, 1);
}

async function handleSubmit() {
  if (!validate()) {
    uni.showToast({ title: '请填写必填项', icon: 'none' });
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  uni.showLoading({ title: '提交中...' });
  try {
    const payload: Record<string, unknown> = {
      workOrderNumber: form.workOrderNumber.trim(),
      processName: form.processName.trim(),
      partName: form.partName.trim(),
      reporter: form.reporter.trim(),
      priority: form.priority,
    };
    if (form.quantity.trim()) payload.quantity = Number(form.quantity);
    if (form.team.trim()) payload.team = form.team.trim();
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.attachments.length > 0) payload.attachments = form.attachments;

    const res = await submitInspectionRequest(payload);
    if (res.code !== 0) throw new Error(res.message || '提交失败');
    uni.showToast({ title: '报检提交成功', icon: 'success', duration: 2000 });
    setTimeout(() => {
      uni.navigateBack();
    }, 1500);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '提交失败，请重试';
    uni.showToast({ title: msg, icon: 'none', duration: 2500 });
  } finally {
    submitting.value = false;
    uni.hideLoading();
  }
}
</script>

<template>
  <view class="page">
    <scroll-view class="scroll-body" scroll-y>
      <view class="card">
        <!-- 工单号 -->
        <view class="form-item" :class="{ error: errors.workOrderNumber }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">工单号</text>
          </view>
          <input
            v-model="form.workOrderNumber"
            class="input"
            placeholder="请输入工单号"
            placeholder-class="input-placeholder"
            @input="errors.workOrderNumber = false"
          />
        </view>

        <!-- 工序 -->
        <view class="form-item" :class="{ error: errors.processName }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">工序</text>
          </view>
          <input
            v-model="form.processName"
            class="input"
            placeholder="请输入工序名称"
            placeholder-class="input-placeholder"
            @input="errors.processName = false"
          />
        </view>

        <!-- 零件名称 -->
        <view class="form-item" :class="{ error: errors.partName }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">零件名称</text>
          </view>
          <input
            v-model="form.partName"
            class="input"
            placeholder="请输入零件名称"
            placeholder-class="input-placeholder"
            @input="errors.partName = false"
          />
        </view>

        <!-- 数量 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">数量</text>
          </view>
          <input
            v-model="form.quantity"
            class="input"
            type="digit"
            placeholder="请输入数量（选填）"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 报检人 -->
        <view class="form-item" :class="{ error: errors.reporter }">
          <view class="label-wrap">
            <text class="required-star">*</text>
            <text class="label">报检人</text>
          </view>
          <input
            v-model="form.reporter"
            class="input input-readonly"
            placeholder="报检人"
            placeholder-class="input-placeholder"
            :disabled="true"
          />
        </view>

        <!-- 班组 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">班组</text>
          </view>
          <input
            v-model="form.team"
            class="input"
            placeholder="请输入班组（选填）"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 优先级 -->
        <view class="form-item">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">优先级</text>
          </view>
          <picker
            class="picker"
            mode="selector"
            :range="priorityOptions"
            :value="priorityIndex"
            @change="onPriorityChange"
          >
            <view class="picker-inner">
              <text class="picker-text">{{
                priorityOptions[priorityIndex]
              }}</text>
              <text class="picker-arrow">›</text>
            </view>
          </picker>
        </view>

        <!-- 描述 -->
        <view class="form-item form-item--textarea">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">描述</text>
          </view>
          <textarea
            v-model="form.description"
            class="textarea"
            placeholder="请输入描述（选填）"
            placeholder-class="input-placeholder"
            :maxlength="500"
            auto-height
          ></textarea>
        </view>

        <!-- 附件 -->
        <view class="form-item form-item--attach">
          <view class="label-wrap">
            <text class="label-spacer" />
            <text class="label">附件</text>
          </view>
          <view class="photo-grid">
            <view
              v-for="(url, idx) in form.attachments"
              :key="url"
              class="photo-item"
            >
              <image class="photo-thumb" :src="url" mode="aspectFill" />
              <view class="photo-remove" @tap="handleRemovePhoto(idx)">
                <text class="photo-remove-icon">×</text>
              </view>
            </view>
            <view
              v-if="form.attachments.length < 6"
              class="photo-add"
              @tap="handleAddPhoto"
            >
              <text class="photo-add-icon">+</text>
              <text class="photo-add-text">添加图片</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- Fixed submit button -->
    <view class="footer">
      <button
        class="btn-submit"
        :disabled="submitting"
        :loading="submitting"
        @tap="handleSubmit"
      >
        提交报检
      </button>
    </view>
  </view>
</template>

<style lang="scss">
.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: $bg-color;
}

.scroll-body {
  flex: 1;
  padding-bottom: 160rpx;
}

.card {
  margin: 24rpx;
  overflow: hidden;
  background: #fff;
  border-radius: 16rpx;
}

.form-item {
  display: flex;
  align-items: center;
  min-height: 96rpx;
  padding: 0 28rpx;
  border-bottom: 1rpx solid $border-color;

  &:last-child {
    border-bottom: none;
  }

  &.error .input,
  &.error .picker {
    border-color: $error-color;
  }

  &--textarea {
    align-items: flex-start;
    padding-top: 24rpx;
    padding-bottom: 24rpx;
  }

  &--attach {
    align-items: flex-start;
    padding-top: 24rpx;
    padding-bottom: 24rpx;
  }
}

.label-wrap {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 160rpx;
}

.required-star {
  margin-right: 6rpx;
  font-size: 28rpx;
  line-height: 1;
  color: $error-color;
}

.label-spacer {
  width: 18rpx;
}

.label {
  font-size: 28rpx;
  color: $text-color;
}

.input {
  flex: 1;
  height: 64rpx;
  padding: 0 8rpx;
  font-size: 28rpx;
  color: $text-color;
  background: transparent;
  border: 2rpx solid transparent;
  border-radius: 8rpx;

  &-readonly {
    color: $text-color-secondary;
  }
}

.input-placeholder {
  color: #bfbfbf;
}

.picker {
  flex: 1;
  border: 2rpx solid transparent;
  border-radius: 8rpx;
}

.picker-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64rpx;
  padding: 0 8rpx;
}

.picker-text {
  font-size: 28rpx;
  color: $text-color;
}

.picker-arrow {
  font-size: 36rpx;
  line-height: 1;
  color: #bfbfbf;
}

.textarea {
  flex: 1;
  min-height: 120rpx;
  padding: 8rpx;
  font-size: 28rpx;
  line-height: 1.6;
  color: $text-color;
}

.photo-grid {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  overflow: hidden;
  border-radius: 8rpx;
}

.photo-thumb {
  width: 100%;
  height: 100%;
}

.photo-remove {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44rpx;
  height: 44rpx;
  background: rgb(0 0 0 / 50%);
  border-bottom-left-radius: 8rpx;
}

.photo-remove-icon {
  font-size: 32rpx;
  line-height: 1;
  color: #fff;
}

.photo-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200rpx;
  height: 200rpx;
  border: 2rpx dashed $border-color;
  border-radius: 8rpx;
}

.photo-add-icon {
  font-size: 56rpx;
  line-height: 1;
  color: #bfbfbf;
}

.photo-add-text {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #bfbfbf;
}

.footer {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 16rpx 32rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1rpx solid $border-color;
}

.btn-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  font-size: 32rpx;
  font-weight: 600;
  color: #fff;
  background: $primary-color;
  border: none;
  border-radius: 16rpx;

  &[disabled] {
    opacity: 0.6;
  }
}
</style>
