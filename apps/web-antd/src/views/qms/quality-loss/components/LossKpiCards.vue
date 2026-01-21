<script lang="ts" setup>
import type { LossStatistics } from '../types';

import { Card, Col, Row } from 'ant-design-vue';

defineProps<{
  stats: LossStatistics;
}>();
</script>

<template>
  <Row :gutter="16">
    <!-- 年度累计总损失 -->
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              年度累计总损失
            </div>
            <div class="text-2xl font-bold text-gray-800">
              ¥{{ stats.totalAmount.toLocaleString() }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100/50 bg-blue-50 text-2xl text-blue-500 shadow-sm"
          >
            <span class="i-lucide-banknote"></span>
          </div>
        </div>
      </Card>
    </Col>

    <!-- 实际索赔回收额 -->
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              实际索赔回收额
            </div>
            <div class="text-2xl font-bold text-green-600">
              ¥{{ stats.totalClaim.toLocaleString() }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-green-100/50 bg-green-50 text-2xl text-green-500 shadow-sm"
          >
            <span class="i-lucide-trending-up"></span>
          </div>
        </div>
      </Card>
    </Col>

    <!-- 索赔挽回率 -->
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              索赔挽回率
            </div>
            <div class="text-2xl font-bold text-gray-800">
              {{ stats.recoveryRate }}%
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-100/50 bg-orange-50 text-2xl text-orange-500 shadow-sm"
          >
            <span class="i-lucide-percent"></span>
          </div>
        </div>
      </Card>
    </Col>

    <!-- 待处理损失额 -->
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              待处理损失额
            </div>
            <div class="text-2xl font-bold text-red-500">
              ¥{{ stats.pendingAmount.toLocaleString() }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-red-100/50 bg-red-50 text-2xl text-red-500 shadow-sm"
          >
            <span class="i-lucide-clock"></span>
          </div>
        </div>
      </Card>
    </Col>
  </Row>
</template>
