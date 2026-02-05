<script lang="ts" setup>
import { onErrorCaptured, ref } from 'vue';

import { Button, Result } from 'ant-design-vue';

import { logRemoteError } from '#/utils/client-logger';

const error = ref<Error | null>(null);

onErrorCaptured((err, instance, info) => {
  error.value = err instanceof Error ? err : new Error(String(err));

  // 将组件级别的崩溃记录到后端
  logRemoteError(
    `Component crash in ${instance?.$options.name || 'Unknown Component'}`,
    {
      error: error.value.message,
      info,
      stack: error.value.stack,
    },
  );

  // 返回 false 阻止错误继续向上传播
  return false;
});

function handleRetry() {
  error.value = null;
  // 可以选择刷新页面或重新挂载
  window.location.reload();
}
</script>

<template>
  <div v-if="error" class="error-boundary-container">
    <Result
      status="error"
      sub-title="抱歉，该区域由于数据或脚本异常暂时无法显示。错误已上报，我们将尽快修复。"
      title="区域加载异常"
    >
      <template #extra>
        <Button key="retry" type="primary" @click="handleRetry">
          刷新页面
        </Button>
      </template>
    </Result>
  </div>
  <slot v-else></slot>
</template>

<style scoped>
.error-boundary-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: #fff;
  border: 1px dashed #ffa39e;
  border-radius: 8px;
}
</style>
