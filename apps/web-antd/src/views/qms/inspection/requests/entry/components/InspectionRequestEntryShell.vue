<script setup lang="ts">
import { Alert } from 'ant-design-vue';
</script>

<template>
  <div
    class="inspection-entry-page min-h-[100dvh] overflow-x-hidden bg-gray-100 px-2 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-3 sm:px-6 sm:py-8"
  >
    <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-3 sm:gap-4">
      <header
        class="rounded-lg bg-white px-4 py-3 shadow-sm sm:rounded-xl sm:px-6 sm:py-4"
      >
        <h1 class="text-lg font-semibold text-gray-900 sm:text-xl">扫码报检</h1>
        <p class="mt-1 text-sm text-gray-500">
          填写车间报检信息后，调度可在报检任务中派单。
        </p>
      </header>

      <main
        class="min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:rounded-xl sm:p-6"
      >
        <Alert
          class="mb-4"
          message="该入口无需登录账号，适合车间扫码填报。"
          type="info"
          show-icon
        />
        <slot></slot>
      </main>
    </div>
  </div>
</template>
