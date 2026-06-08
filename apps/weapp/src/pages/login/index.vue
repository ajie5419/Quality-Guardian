<script setup lang="ts">
import { ref } from 'vue';

import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

const loading = ref(false);
const showBindForm = ref(false);
const sessionToken = ref('');
const username = ref('');
const password = ref('');

async function handleLogin() {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await userStore.login();
    if (result.needBind) {
      sessionToken.value = result.sessionToken;
      showBindForm.value = true;
    } else {
      uni.switchTab({ url: '/pages/home/index' });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : '登录失败，请重试';
    uni.showToast({ title: msg, icon: 'none', duration: 2000 });
  } finally {
    loading.value = false;
  }
}

async function handleBind() {
  if (!username.value.trim() || !password.value.trim()) {
    uni.showToast({ title: '请填写用户名和密码', icon: 'none' });
    return;
  }
  if (loading.value) return;
  loading.value = true;
  try {
    await userStore.bind(
      sessionToken.value,
      username.value.trim(),
      password.value,
    );
    uni.switchTab({ url: '/pages/home/index' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '绑定失败，请重试';
    uni.showToast({ title: msg, icon: 'none', duration: 2000 });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="login-page">
    <view class="logo-section">
      <view class="logo-icon">QG</view>
      <text class="app-title">Quality Guardian</text>
      <text class="app-subtitle">质量管理系统</text>
    </view>

    <view v-if="!showBindForm" class="action-section">
      <button
        class="btn-primary"
        :loading="loading"
        :disabled="loading"
        @tap="handleLogin"
      >
        微信一键登录
      </button>
    </view>

    <view v-else class="bind-form">
      <text class="bind-title">绑定已有账号</text>
      <text class="bind-desc">首次登录，请绑定您的系统账号</text>
      <input
        v-model="username"
        class="input-field"
        placeholder="请输入用户名"
        placeholder-class="input-placeholder"
      />
      <input
        v-model="password"
        class="input-field"
        type="safe-password"
        placeholder="请输入密码"
        placeholder-class="input-placeholder"
      />
      <button
        class="btn-primary"
        :loading="loading"
        :disabled="loading"
        @tap="handleBind"
      >
        绑定账号
      </button>
    </view>
  </view>
</template>

<style lang="scss">
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  padding: 120rpx 40rpx 40rpx;
  background: #fff;
}

.logo-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 100rpx;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 24rpx;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  background: $primary-color;
  border-radius: 28rpx;
}

.app-title {
  margin-bottom: 12rpx;
  font-size: 44rpx;
  font-weight: 700;
  color: $text-color;
}

.app-subtitle {
  font-size: 28rpx;
  color: $text-color-secondary;
}

.action-section {
  width: 100%;
}

.bind-form {
  width: 100%;
}

.bind-title {
  display: block;
  margin-bottom: 12rpx;
  font-size: 36rpx;
  font-weight: 600;
  color: $text-color;
}

.bind-desc {
  display: block;
  margin-bottom: 48rpx;
  font-size: 26rpx;
  color: $text-color-secondary;
}

.input-field {
  box-sizing: border-box;
  width: 100%;
  height: 88rpx;
  padding: 0 28rpx;
  margin-bottom: 24rpx;
  font-size: 28rpx;
  color: $text-color;
  background: $bg-color;
  border: 2rpx solid #e8e8e8;
  border-radius: 12rpx;
}

.input-placeholder {
  color: #bfbfbf;
}

.btn-primary {
  width: 100%;
  height: 96rpx;
  margin-top: 16rpx;
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
