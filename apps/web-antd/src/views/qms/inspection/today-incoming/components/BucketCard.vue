<script lang="ts" setup>
import type { PublicTodayIncomingInspectionItem } from '#/api/qms/inspection-request';

import { computed } from 'vue';

import { Empty, Tag } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    formatTime: (value: null | string) => string;
    items: PublicTodayIncomingInspectionItem[];
    showQuality?: boolean;
    title: string;
    tone: 'amber' | 'cyan' | 'emerald' | 'red';
  }>(),
  { showQuality: false },
);

const headerToneClass = computed(() => {
  switch (props.tone) {
    case 'amber': {
      return 'bg-amber-50 text-amber-700';
    }
    case 'cyan': {
      return 'bg-cyan-50 text-cyan-700';
    }
    case 'emerald': {
      return 'bg-emerald-50 text-emerald-700';
    }
    case 'red': {
      return 'bg-red-50 text-red-700';
    }
    default: {
      return 'bg-gray-50 text-gray-700';
    }
  }
});

const tagColor = computed(() => {
  switch (props.tone) {
    case 'amber': {
      return 'orange';
    }
    case 'cyan': {
      return 'cyan';
    }
    case 'emerald': {
      return 'green';
    }
    case 'red': {
      return 'red';
    }
    default: {
      return 'default';
    }
  }
});

function failBadge(item: PublicTodayIncomingInspectionItem) {
  if (item.inspectionResult !== 'FAIL') return '';
  return item.status === 'CLOSED' ? '不合格关闭' : '不合格待复检';
}
</script>

<template>
  <section class="overflow-hidden rounded-xl bg-white shadow-sm">
    <header
      class="flex items-center justify-between px-4 py-3"
      :class="headerToneClass"
    >
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <Tag :color="tagColor">{{ items.length }}</Tag>
    </header>

    <div v-if="items.length === 0" class="px-4 py-8">
      <Empty :image-style="{ height: '60px' }" description="暂无数据" />
    </div>

    <ul v-else class="divide-y divide-gray-100">
      <li v-for="item in items" :key="item.requestNo" class="px-4 py-3 sm:px-5">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-semibold text-gray-900">
              {{ item.partName || '—' }}
            </span>
            <Tag v-if="failBadge(item)" color="red">{{ failBadge(item) }}</Tag>
          </div>
          <span class="text-xs text-gray-400">{{ item.requestNo }}</span>
        </div>
        <div
          class="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 sm:grid-cols-3 sm:text-sm"
        >
          <div>
            <span class="text-gray-400">供应商：</span>
            <span>{{ item.supplierName || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-400">工单号：</span>
            <span>{{ item.workOrderNumber }}</span>
          </div>
          <div>
            <span class="text-gray-400">数量：</span>
            <span>{{ item.quantity }}</span>
          </div>
          <div v-if="item.incomingType">
            <span class="text-gray-400">进货类型：</span>
            <span>{{ item.incomingType }}</span>
          </div>
          <div>
            <span class="text-gray-400">报检人：</span>
            <span>{{ item.reporter || '—' }}</span>
          </div>
          <div>
            <span class="text-gray-400">报检时间：</span>
            <span>{{ formatTime(item.submittedAt) }}</span>
          </div>
        </div>
        <div
          v-if="
            showQuality &&
            (item.qualifiedQuantity !== null ||
              item.unqualifiedQuantity !== null)
          "
          class="mt-1 text-xs text-red-600 sm:text-sm"
        >
          合格 {{ item.qualifiedQuantity ?? 0 }} / 不合格
          {{ item.unqualifiedQuantity ?? 0 }}
        </div>
        <div v-if="item.notes" class="mt-1 text-xs text-gray-500 sm:text-sm">
          备注：{{ item.notes }}
        </div>
      </li>
    </ul>
  </section>
</template>
