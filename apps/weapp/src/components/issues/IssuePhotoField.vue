<script setup lang="ts">
import { ref } from 'vue';

import { buildResourceUrl, uploadFile } from '@/api/request';
import { INSPECTION_ISSUE_FIELD_LIMITS } from '@qgs/shared';

const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ 'update:modelValue': [string[]] }>();
const uploading = ref(false);

async function choosePhotos() {
  const remaining =
    INSPECTION_ISSUE_FIELD_LIMITS.PHOTOS - props.modelValue.length;
  if (remaining <= 0 || uploading.value) return;
  const selected = await new Promise<UniApp.ChooseImageSuccessCallbackResult>(
    (resolve, reject) => {
      uni.chooseImage({
        count: remaining,
        sizeType: ['compressed'],
        sourceType: ['camera', 'album'],
        success: resolve,
        fail: reject,
      });
    },
  ).catch(() => null);
  if (!selected) return;
  uploading.value = true;
  uni.showLoading({ title: '上传中...' });
  let errorMessage = '';
  try {
    const photos = [...props.modelValue];
    let failedCount = 0;
    for (const path of selected.tempFilePaths) {
      const res = await uploadFile(path);
      if (res.code === 0 && res.data?.url) {
        photos.push(res.data.url);
      } else {
        failedCount += 1;
      }
    }
    emit('update:modelValue', photos);
    if (failedCount > 0) {
      errorMessage = `${failedCount} 张照片上传失败`;
    }
  } catch {
    errorMessage = '照片上传失败，请重试';
  } finally {
    uploading.value = false;
    uni.hideLoading();
  }
  if (errorMessage) {
    uni.showToast({ title: errorMessage, icon: 'none' });
  }
}

function removePhoto(index: number) {
  const photos = [...props.modelValue];
  photos.splice(index, 1);
  emit('update:modelValue', photos);
}

function previewPhoto(url: string) {
  uni.previewImage({
    current: buildResourceUrl(url),
    urls: props.modelValue.map((photo) => buildResourceUrl(photo)),
  });
}
</script>

<template>
  <view class="field">
    <view class="photo-heading">
      <text class="label">问题照片</text>
      <text class="photo-count">
        {{ modelValue.length }}/{{ INSPECTION_ISSUE_FIELD_LIMITS.PHOTOS }}
      </text>
    </view>
    <view class="photo-grid">
      <view
        v-for="(photo, index) in modelValue"
        :key="photo"
        class="photo-item"
      >
        <image
          class="photo"
          :src="buildResourceUrl(photo)"
          mode="aspectFill"
          @tap="previewPhoto(photo)"
        />
        <view class="photo-remove" @tap.stop="removePhoto(index)">×</view>
      </view>
      <view
        v-if="modelValue.length < INSPECTION_ISSUE_FIELD_LIMITS.PHOTOS"
        class="photo-add"
        @tap="choosePhotos"
      >
        <text class="photo-add-icon">+</text>
        <text>添加照片</text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.field {
  padding: 24rpx 0;
}

.photo-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.label {
  margin-bottom: 14rpx;
  font-size: 26rpx;
  font-weight: 500;
  color: $text-color;
}

.photo-count {
  font-size: 24rpx;
  color: $text-color-secondary;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}

.photo-item,
.photo-add {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8rpx;
}

.photo {
  width: 100%;
  height: 100%;
}

.photo-remove {
  position: absolute;
  top: 6rpx;
  right: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
  color: #fff;
  background: rgb(0 0 0 / 55%);
  border-radius: 50%;
}

.photo-add {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: $text-color-secondary;
  border: 2rpx dashed #bfbfbf;
}

.photo-add-icon {
  font-size: 48rpx;
}
</style>
