<script lang="ts" setup>
import type { FileStorageStats } from '#/api/qms/file-center';

import { Spin } from 'ant-design-vue';

defineProps<{
  loading: boolean;
  stats: FileStorageStats;
}>();

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${Number.parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`;
}

function getStatusStat(stats: FileStorageStats, status: string) {
  return stats.byStatus.find((item) => item.status === status);
}

function getStorageProviderStat(
  stats: FileStorageStats,
  storageProvider: string,
) {
  return stats.byStorageProvider.find(
    (item) => item.storageProvider === storageProvider,
  );
}
</script>

<template>
  <Spin :spinning="loading">
    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div class="rounded border border-blue-100 bg-blue-50 px-4 py-3">
        <div class="text-xs text-blue-700">总存储占用</div>
        <div class="mt-1 text-2xl font-semibold text-blue-950">
          {{ formatBytes(stats.totalSize) }}
        </div>
        <div class="mt-1 text-xs text-blue-700">
          共 {{ stats.totalCount }} 个文件
        </div>
      </div>
      <div class="rounded border border-emerald-100 bg-emerald-50 px-4 py-3">
        <div class="text-xs text-emerald-700">有效文件占用</div>
        <div class="mt-1 text-2xl font-semibold text-emerald-950">
          {{ formatBytes(stats.activeSize) }}
        </div>
        <div class="mt-1 text-xs text-emerald-700">
          ACTIVE {{ stats.activeCount }} 个
        </div>
      </div>
      <div class="rounded border border-violet-100 bg-violet-50 px-4 py-3">
        <div class="text-xs text-violet-700">存储位置</div>
        <div class="mt-2 space-y-1 text-xs text-violet-900">
          <div class="flex items-center justify-between gap-2">
            <span>OSS</span>
            <span class="font-semibold">
              {{ formatBytes(getStorageProviderStat(stats, 'OSS')?.size || 0) }}
              / {{ getStorageProviderStat(stats, 'OSS')?.count || 0 }} 个
            </span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span>LOCAL</span>
            <span class="font-semibold">
              {{
                formatBytes(getStorageProviderStat(stats, 'LOCAL')?.size || 0)
              }}
              / {{ getStorageProviderStat(stats, 'LOCAL')?.count || 0 }} 个
            </span>
          </div>
        </div>
      </div>
      <div class="rounded border border-amber-100 bg-amber-50 px-4 py-3">
        <div class="text-xs text-amber-700">文件使用情况</div>
        <div class="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <div class="text-lg font-semibold text-amber-950">
              {{ stats.referencedCount }}
            </div>
            <div class="text-amber-700">已引用</div>
          </div>
          <div>
            <div class="text-lg font-semibold text-amber-950">
              {{ stats.orphanCount }}
            </div>
            <div class="text-amber-700">孤儿</div>
          </div>
          <div>
            <div class="text-lg font-semibold text-amber-950">
              {{ getStatusStat(stats, 'MISSING')?.count || 0 }}
            </div>
            <div class="text-amber-700">缺失</div>
          </div>
        </div>
      </div>
    </div>
  </Spin>
</template>
