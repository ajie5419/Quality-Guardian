<script lang="ts" setup>
import type { PublicTodayIncomingInspectionItem } from '#/api/qms/inspection-request';

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { Alert, Button, message, Spin } from 'ant-design-vue';

import { getPublicTodayIncomingInspections } from '#/api/qms/inspection-request';

import BucketCard from './components/BucketCard.vue';

defineOptions({ name: 'PublicTodayIncomingInspection' });

const loading = ref(false);
const summary = ref({ pending: 0, pass: 0, fail: 0, conditional: 0, total: 0 });
const pendingItems = ref<PublicTodayIncomingInspectionItem[]>([]);
const passItems = ref<PublicTodayIncomingInspectionItem[]>([]);
const failItems = ref<PublicTodayIncomingInspectionItem[]>([]);
const conditionalItems = ref<PublicTodayIncomingInspectionItem[]>([]);
const generatedAt = ref('');
const dateLabel = ref('');
const truncated = ref(false);

const generatedAtLabel = computed(() => {
  if (!generatedAt.value) return '';
  const date = new Date(generatedAt.value);
  if (Number.isNaN(date.getTime())) return generatedAt.value;
  return date.toLocaleTimeString('zh-CN', { hour12: false });
});

async function fetchData() {
  loading.value = true;
  try {
    const data = await getPublicTodayIncomingInspections();
    summary.value = data.summary;
    pendingItems.value = data.pendingItems;
    passItems.value = data.passItems;
    failItems.value = data.failItems;
    conditionalItems.value = data.conditionalItems;
    generatedAt.value = data.generatedAt;
    dateLabel.value = data.dateLabel;
    truncated.value = data.truncated;
  } catch (error) {
    const text = error instanceof Error ? error.message : '获取数据失败';
    message.error(text);
  } finally {
    loading.value = false;
  }
}

function formatTime(value: null | string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

let timer: null | ReturnType<typeof setInterval> = null;
onMounted(() => {
  fetchData();
  timer = setInterval(fetchData, 60_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div
    class="today-incoming-page min-h-[100dvh] bg-gray-100 px-3 py-4 sm:px-6 sm:py-8"
  >
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <header class="rounded-xl bg-white px-5 py-4 shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 class="text-lg font-semibold text-gray-900 sm:text-xl">
              今日外购件检验情况
            </h1>
            <p class="mt-1 text-xs text-gray-500 sm:text-sm">
              {{ dateLabel }}
              <span v-if="generatedAtLabel" class="ml-2">
                更新于 {{ generatedAtLabel }}
              </span>
            </p>
          </div>
          <Button :loading="loading" @click="fetchData">刷新</Button>
        </div>
      </header>

      <Alert
        v-if="truncated"
        message="数据量较大，仅展示最新 200 条今日报检记录。"
        type="warning"
        show-icon
      />

      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div class="text-xs text-gray-500">合计</div>
          <div class="mt-1 text-2xl font-semibold text-gray-900">
            {{ summary.total }}
          </div>
        </div>
        <div class="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div class="text-xs text-gray-500">待检验</div>
          <div class="mt-1 text-2xl font-semibold text-amber-600">
            {{ summary.pending }}
          </div>
        </div>
        <div class="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div class="text-xs text-gray-500">合格</div>
          <div class="mt-1 text-2xl font-semibold text-emerald-600">
            {{ summary.pass }}
          </div>
        </div>
        <div class="rounded-xl bg-white px-4 py-3 shadow-sm">
          <div class="text-xs text-gray-500">不合格</div>
          <div class="mt-1 text-2xl font-semibold text-red-600">
            {{ summary.fail }}
          </div>
        </div>
      </section>

      <Spin :spinning="loading">
        <div class="flex flex-col gap-4">
          <BucketCard
            tone="amber"
            title="已报检 / 待检验"
            :items="pendingItems"
            :format-time="formatTime"
          />
          <BucketCard
            tone="emerald"
            title="已报检 / 检验合格"
            :items="passItems"
            :format-time="formatTime"
          />
          <BucketCard
            v-if="conditionalItems.length > 0"
            tone="cyan"
            title="已报检 / 让步合格"
            :items="conditionalItems"
            :format-time="formatTime"
          />
          <BucketCard
            tone="red"
            title="已报检 / 不合格"
            :items="failItems"
            :format-time="formatTime"
            show-quality
          />
        </div>
      </Spin>
    </div>
  </div>
</template>
