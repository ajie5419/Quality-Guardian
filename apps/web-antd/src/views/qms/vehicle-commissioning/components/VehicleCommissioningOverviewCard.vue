<script lang="ts" setup>
import { Card } from 'ant-design-vue';

defineProps<{
  issuesByStatus: Record<
    'CLOSED' | 'IN_PROGRESS' | 'OPEN' | 'RESOLVED',
    number
  >;
}>();
</script>

<template>
  <Card title="调试验收执行概览" size="small">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded border p-3">
        <div class="text-xs text-gray-500">待处理</div>
        <div class="text-xl font-semibold text-orange-500">
          {{ issuesByStatus.OPEN }}
        </div>
      </div>
      <div class="rounded border p-3">
        <div class="text-xs text-gray-500">处理中</div>
        <div class="text-xl font-semibold text-blue-500">
          {{ issuesByStatus.IN_PROGRESS }}
        </div>
      </div>
      <div class="rounded border p-3">
        <div class="text-xs text-gray-500">待验证</div>
        <div class="text-xl font-semibold text-purple-500">
          {{ issuesByStatus.RESOLVED }}
        </div>
      </div>
      <div class="rounded border p-3">
        <div class="text-xs text-gray-500">已关闭</div>
        <div class="text-xl font-semibold text-green-500">
          {{ issuesByStatus.CLOSED }}
        </div>
      </div>
    </div>
  </Card>
</template>
