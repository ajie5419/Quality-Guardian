<script lang="ts" setup>
import type { QmsSupplierApi } from '#/api/qms/supplier';

import { useI18n } from '@vben/locales';

import { Card, Col, Row } from 'ant-design-vue';

interface Props {
  stats: QmsSupplierApi.SupplierStats;
  type?: 'Outsourcing' | 'Supplier';
}

withDefaults(defineProps<Props>(), {
  type: 'Supplier',
});

const { t } = useI18n();
</script>

<template>
  <Row :gutter="16">
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {{
                type === 'Supplier'
                  ? t('qms.supplier.totalCount')
                  : t('qms.outsourcing.totalCount')
              }}
            </div>
            <div class="text-2xl font-bold text-gray-800">
              {{ stats.total ?? 0 }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-blue-100/50 bg-blue-50 text-2xl text-blue-500 shadow-sm"
          >
            <span class="i-lucide-users"></span>
          </div>
        </div>
      </Card>
    </Col>
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {{ t('qms.supplier.qualifiedCount') }}
            </div>
            <div class="text-2xl font-bold text-gray-800">
              {{ stats.qualified ?? 0 }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-green-100/50 bg-green-50 text-2xl text-green-500 shadow-sm"
          >
            <span class="i-lucide-check-circle"></span>
          </div>
        </div>
      </Card>
    </Col>
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {{ t('qms.supplier.warningCount') }}
            </div>
            <div class="text-2xl font-bold text-red-600">
              {{ stats.warning ?? 0 }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-red-100/50 bg-red-50 text-2xl text-red-500 shadow-sm"
          >
            <span class="i-lucide-alert-triangle"></span>
          </div>
        </div>
      </Card>
    </Col>
    <Col :span="6">
      <Card :bordered="false" class="shadow-sm transition-all hover:shadow-md">
        <div class="flex items-center justify-between">
          <div>
            <div
              class="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {{ t('qms.supplier.avgScore') }}
            </div>
            <div class="text-2xl font-bold text-gray-800">
              {{ stats.avgScore ?? '0.0' }}
            </div>
          </div>
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-orange-100/50 bg-orange-50 text-2xl text-orange-500 shadow-sm"
          >
            <span class="i-lucide-bar-chart-3"></span>
          </div>
        </div>
      </Card>
    </Col>
  </Row>
</template>
