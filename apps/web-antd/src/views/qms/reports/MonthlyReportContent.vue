<script lang="ts" setup>
import type { QualityReportSummary } from '#/api/qms/reports';

import { computed } from 'vue';

import {
  Col,
  Empty,
  Progress,
  Row,
  Tag,
  TypographyTitle,
} from 'ant-design-vue';

const props = defineProps<{
  renderSparkline: (data: number[], color?: string) => null | string;
  reportData: QualityReportSummary;
  t: (key: string, params?: Record<string, any>) => string;
}>();

function getCategoryLabel(category: string) {
  const normalized = (category || '').trim().toUpperCase();
  switch (normalized) {
    case 'INCOMING': {
      return props.t('qms.inspection.records.tab.incoming');
    }
    case 'PROCESS': {
      return props.t('qms.inspection.records.tab.process');
    }
    case 'SHIPMENT': {
      return props.t('qms.inspection.records.tab.shipment');
    }
    default: {
      return category || props.t('qms.reports.summary.unknownCategory');
    }
  }
}

const processRows = computed(() => {
  const rows = props.reportData.processPassRates || [];
  return [...rows]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((item) => ({
      ...item,
      categoryLabel: getCategoryLabel(item.category),
      processNameLabel:
        item.processName && item.processName !== '未知工序'
          ? item.processName
          : props.t('qms.reports.summary.unknownProcessName'),
    }));
});

const insightRows = computed(() => {
  const metrics = props.reportData.metrics || [];
  const passRate = metrics[0];
  const internalLoss = metrics[1];
  const externalLoss = metrics[2];
  const closingRate = metrics[3];

  const defectTop = props.reportData.defects?.[0];
  const projectTop = props.reportData.topProjects?.[0];
  const supplierWorst = props.reportData.suppliers?.worst?.[0];

  const items: string[] = [];

  if (passRate) {
    const trendWord =
      passRate.trend >= 0
        ? props.t('qms.reports.summary.analysis.trendUp')
        : props.t('qms.reports.summary.analysis.trendDown');
    items.push(
      props.t('qms.reports.summary.analysis.passRate', {
        trend: Math.abs(passRate.trend),
        trendWord,
        unit: passRate.unit,
        value: passRate.value,
      }),
    );
  }

  if (internalLoss && externalLoss) {
    const totalLoss = Number(internalLoss.value) + Number(externalLoss.value);
    items.push(
      props.t('qms.reports.summary.analysis.lossTotal', {
        externalLoss: Number(externalLoss.value).toLocaleString(),
        internalLoss: Number(internalLoss.value).toLocaleString(),
        totalLoss: totalLoss.toLocaleString(),
      }),
    );
  }

  if (closingRate) {
    items.push(
      props.t('qms.reports.summary.analysis.closingRate', {
        unit: closingRate.unit,
        value: closingRate.value,
      }),
    );
  }

  if (defectTop) {
    items.push(
      props.t('qms.reports.summary.analysis.defectTop', {
        count: defectTop.value,
        name: defectTop.name,
      }),
    );
  }

  if (projectTop) {
    items.push(
      props.t('qms.reports.summary.analysis.projectTop', {
        issues: projectTop.issues,
        loss: Number(projectTop.loss).toLocaleString(),
        name: projectTop.name,
      }),
    );
  }

  if (supplierWorst) {
    items.push(
      props.t('qms.reports.summary.analysis.supplierWorst', {
        issues: supplierWorst.issues,
        name: supplierWorst.name,
      }),
    );
  }

  return items;
});
</script>

<template>
  <div class="space-y-10">
    <div>
      <div class="mb-4 flex items-center gap-2 border-b pb-2">
        <span class="i-lucide-layout-dashboard text-blue-500"></span>
        <span class="text-lg font-bold tracking-wider text-gray-700">
          {{ t('qms.reports.summary.sections.overview') }}
        </span>
      </div>
      <Row :gutter="16">
        <Col v-for="item in reportData.metrics" :key="item.label" :span="6">
          <div
            class="group relative overflow-hidden rounded-lg border border-gray-100 bg-gray-50 p-4"
          >
            <div class="mb-1 text-xs text-gray-500">{{ item.label }}</div>
            <div class="flex items-baseline gap-1">
              <span class="text-2xl font-black text-gray-800">{{
                item.value.toLocaleString()
              }}</span>
              <span class="text-xs text-gray-400">{{ item.unit }}</span>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <span
                :class="
                  item.trend >= 0
                    ? item.label.includes('损失')
                      ? 'text-red-500'
                      : 'text-green-500'
                    : item.label.includes('损失')
                      ? 'text-green-500'
                      : 'text-red-500'
                "
              >
                <span
                  v-if="item.trend > 0"
                  class="i-lucide-arrow-up-right"
                ></span>
                <span v-else class="i-lucide-arrow-down-right"></span>
                <b class="ml-0.5 text-xs">{{ Math.abs(item.trend) }}%</b>
              </span>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                class="flex-1 opacity-40 transition-opacity group-hover:opacity-100"
                v-html="
                  renderSparkline(
                    item.history,
                    item.label.includes('损失') ? '#ff4d4f' : '#52c41a',
                  )
                "
              ></div>
            </div>
            <div class="mt-2 text-[11px] text-gray-400">{{ item.desc }}</div>
          </div>
        </Col>
      </Row>
    </div>

    <div>
      <div class="mb-4 flex items-center gap-2 border-b pb-2">
        <span class="i-lucide-scroll-text text-blue-500"></span>
        <span class="text-lg font-bold tracking-wider text-gray-700">
          {{ t('qms.reports.summary.sections.analysis') }}
        </span>
      </div>
      <div class="rounded-lg border bg-gray-50 p-4">
        <ul class="list-disc space-y-2 pl-5 text-sm text-gray-700">
          <li v-for="(item, index) in insightRows" :key="index">{{ item }}</li>
        </ul>
      </div>
    </div>

    <Row :gutter="32">
      <Col :span="12">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <span class="i-lucide-pie-chart text-blue-500"></span>
          <span class="text-lg font-bold tracking-wider text-gray-700">
            {{ t('qms.reports.summary.sections.defectDistribution') }}
          </span>
        </div>
        <div class="space-y-4">
          <div
            v-for="d in reportData.defects"
            :key="d.name"
            class="flex items-center gap-4"
          >
            <div class="w-24 truncate text-right text-xs text-gray-500">
              {{ d.name }}
            </div>
            <div class="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                class="h-full bg-blue-500 transition-all"
                :style="{
                  width: `${reportData.defects[0] ? (d.value / reportData.defects[0].value) * 100 : 0}%`,
                }"
              ></div>
            </div>
            <div class="w-10 font-mono text-sm font-bold text-gray-700">
              {{ d.value }}
            </div>
          </div>
          <Empty
            v-if="reportData.defects.length === 0"
            :description="t('qms.reports.summary.noSignificantDefects')"
          />
        </div>
      </Col>

      <Col :span="12">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <span class="i-lucide-chart-no-axes-combined text-blue-500"></span>
          <span class="text-lg font-bold tracking-wider text-gray-700">
            {{ t('qms.reports.summary.sections.processQuality') }}
          </span>
        </div>
        <div class="space-y-3">
          <div
            v-for="item in processRows"
            :key="`${item.processName}-${item.category}`"
            class="rounded border bg-gray-50 p-3"
          >
            <div class="mb-1 flex items-center justify-between text-xs">
              <span class="font-semibold text-gray-700"
                >{{ item.processNameLabel }} / {{ item.categoryLabel }}</span
              >
              <span class="text-gray-500"
                >{{ item.passed }}/{{ item.total }}，{{
                  t('qms.reports.summary.targetPassRate')
                }}
                {{ item.targetPassRate }}%</span
              >
            </div>
            <Progress
              :percent="item.passRate"
              :stroke-color="
                item.passRate >= item.targetPassRate ? '#52c41a' : '#faad14'
              "
              :show-info="false"
              size="small"
            />
          </div>
          <Empty
            v-if="processRows.length === 0"
            :description="t('qms.reports.summary.noProcessData')"
          />
        </div>
      </Col>
    </Row>

    <Row :gutter="32">
      <Col :span="12">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <span class="i-lucide-triangle-alert text-orange-500"></span>
          <span class="text-lg font-bold tracking-wider text-gray-700">
            {{ t('qms.reports.summary.sections.keyProjects') }}
          </span>
        </div>
        <div class="space-y-3">
          <div
            v-for="item in reportData.topProjects"
            :key="item.name"
            class="rounded-lg border bg-white p-4"
          >
            <div class="flex items-center justify-between">
              <TypographyTitle :level="5" class="m-0">{{
                item.name
              }}</TypographyTitle>
              <Tag color="orange"
                >{{ t('qms.reports.summary.issueCount') }} {{ item.issues }}
                {{ t('common.unit.item') }}</Tag
              >
            </div>
            <div class="mt-2 text-sm text-gray-600">
              {{ t('qms.reports.summary.cumulativeLoss') }}：<b
                class="text-red-500"
                >¥{{ Number(item.loss).toLocaleString() }}</b
              >
            </div>
          </div>
          <Empty
            v-if="reportData.topProjects.length === 0"
            :description="t('qms.reports.summary.noKeyProjectRisk')"
          />
        </div>
      </Col>

      <Col :span="12">
        <div class="mb-4 flex items-center gap-2 border-b pb-2">
          <span class="i-lucide-award text-blue-500"></span>
          <span class="text-lg font-bold tracking-wider text-gray-700">
            {{ t('qms.reports.summary.sections.supplierPerformance') }}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div class="rounded-lg bg-green-50 p-4">
            <div
              class="mb-3 flex items-center gap-1 text-xs font-bold text-green-700"
            >
              <span class="i-lucide-thumbs-up"></span>
              {{ t('qms.reports.summary.topPerformers') }}
            </div>
            <div
              v-for="s in reportData.suppliers.best"
              :key="`best-${s.name}`"
              class="mb-2 flex justify-between text-xs"
            >
              <span class="text-gray-700">{{ s.name }}</span>
              <Tag color="success" class="m-0 scale-75"
                >{{ s.issues }} {{ t('common.unit.item') }}
                {{ t('qms.reports.summary.issueCountSuffix') }}</Tag
              >
            </div>
          </div>
          <div class="rounded-lg bg-red-50 p-4">
            <div
              class="mb-3 flex items-center gap-1 text-xs font-bold text-red-700"
            >
              <span class="i-lucide-alert-octagon"></span>
              {{ t('qms.reports.summary.atRiskPerformers') }}
            </div>
            <div
              v-for="s in reportData.suppliers.worst"
              :key="`worst-${s.name}`"
              class="mb-2 flex justify-between text-xs"
            >
              <span class="text-gray-700">{{ s.name }}</span>
              <Tag color="error" class="m-0 scale-75"
                >{{ s.issues }} {{ t('common.unit.item') }}
                {{ t('qms.reports.summary.issueCountSuffix') }}</Tag
              >
            </div>
          </div>
        </div>
      </Col>
    </Row>

    <div>
      <div class="mb-4 flex items-center gap-2 border-b pb-2">
        <span class="i-lucide-list-checks text-blue-500"></span>
        <span class="text-lg font-bold tracking-wider text-gray-700">
          {{ t('qms.reports.summary.sections.nextActions') }}
        </span>
      </div>
      <div class="rounded-lg bg-blue-600 p-6 text-white">
        <ul class="list-disc space-y-3 pl-5 text-sm leading-6">
          <li v-if="reportData.suppliers.worst.length > 0">
            {{
              t('qms.reports.summary.actionsPlan.supplierRectify', {
                name: reportData.suppliers.worst[0]?.name,
              })
            }}
          </li>
          <li v-if="reportData.defects.length > 0">
            {{
              t('qms.reports.summary.actionsPlan.defectControl', {
                name: reportData.defects[0]?.name,
              })
            }}
          </li>
          <li>{{ t('qms.reports.summary.actionsPlan.projectWeeklyTrack') }}</li>
          <li>{{ t('qms.reports.summary.actionsPlan.knowledgeReuse') }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
