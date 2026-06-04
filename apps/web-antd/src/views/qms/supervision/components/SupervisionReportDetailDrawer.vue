<script lang="ts" setup>
import type { SupervisionDailyReport } from '@qgs/shared';

import {
  Button,
  Card,
  Drawer,
  Image,
  Progress,
  Space,
  Tag,
} from 'ant-design-vue';

import { useMobileViewport } from '#/hooks/useMobileViewport';

interface Props {
  open: boolean;
  planTaskColor: (value?: string) => string;
  planTaskLabel: (value?: string) => string;
  report?: SupervisionDailyReport;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:open': [value: boolean];
}>();
const { isMobile } = useMobileViewport();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="监造日报详情"
    :width="isMobile ? '100vw' : 720"
    :body-style="{ overflowX: 'hidden', backgroundColor: '#f5f5f5' }"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.report" class="space-y-3">
      <Card size="small">
        <div class="text-center">
          <div class="text-lg font-semibold">
            {{ props.report.projectName }}
          </div>
          <div
            v-if="props.report.workOrderNumber"
            class="mt-1 text-sm text-gray-500"
          >
            工单号：{{ props.report.workOrderNumber }}
          </div>
          <div class="mt-1 text-sm text-gray-500">监造现场日报</div>
          <div class="mt-2 text-xl font-bold text-blue-600">
            {{ props.report.reportDate }}
          </div>
        </div>
      </Card>

      <Card size="small" title="基本信息">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-xs text-gray-500">监造员</div>
            <div class="font-medium">{{ props.report.reporter || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">现场人数</div>
            <div class="font-medium">{{ props.report.manpower || '—' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">现场地点</div>
            <div class="font-medium">{{ props.report.location || '-' }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">天气</div>
            <div class="font-medium">{{ props.report.weather || '-' }}</div>
          </div>
        </div>
        <div v-if="props.report.progressPercent > 0" class="mt-3">
          <div class="mb-1 text-xs text-gray-500">项目进度</div>
          <Progress :percent="props.report.progressPercent" />
        </div>
      </Card>

      <Card v-if="props.report.workContent" size="small" title="今日工作内容">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.workContent }}
        </div>
      </Card>

      <Card
        v-if="props.report.completedMilestone"
        size="small"
        title="完成节点"
      >
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.completedMilestone }}
        </div>
      </Card>

      <Card
        v-if="props.report.taskUpdates && props.report.taskUpdates.length > 0"
        size="small"
        title="任务推进情况"
      >
        <div class="space-y-3">
          <div
            v-for="task in props.report.taskUpdates"
            :key="task.id || task.taskId"
            class="rounded border bg-gray-50 p-3"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">
                    {{ task.taskNo }} {{ task.taskName }}
                  </span>
                  <Tag :color="props.planTaskColor(task.status)">
                    {{ props.planTaskLabel(task.status) }}
                  </Tag>
                </div>
                <div class="mt-1 text-xs text-gray-500">
                  数量：{{ task.completedQuantity || 0 }}/{{
                    task.plannedQuantity || 0
                  }}{{ task.quantityUnit || '' }}
                  <span v-if="task.dailyQuantity" class="text-green-600">
                    （本次 +{{ task.dailyQuantity
                    }}{{ task.quantityUnit || '' }}）
                  </span>
                </div>
              </div>
              <div class="w-24 text-right">
                <div class="text-lg font-semibold text-blue-600">
                  {{ task.progressPercent }}%
                </div>
              </div>
            </div>
            <Progress
              class="mt-2"
              :percent="task.progressPercent"
              size="small"
            />
            <div v-if="task.workContent" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">工作内容</div>
              <div class="mt-1 whitespace-pre-wrap">{{ task.workContent }}</div>
            </div>
            <div v-if="task.nextPlan" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">下一步计划</div>
              <div class="mt-1 whitespace-pre-wrap">{{ task.nextPlan }}</div>
            </div>
            <div v-if="task.riskReason" class="mt-2 text-sm">
              <div class="text-xs text-gray-500">风险原因</div>
              <div class="mt-1 whitespace-pre-wrap text-orange-600">
                {{ task.riskReason }}
              </div>
            </div>
            <div v-if="task.photos && task.photos.length > 0" class="mt-2">
              <div class="mb-1 text-xs text-gray-500">现场照片</div>
              <div class="flex flex-wrap gap-2">
                <Image
                  v-for="url in task.photos"
                  :key="url"
                  :src="url"
                  :width="80"
                  :height="80"
                  class="rounded object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card v-if="props.report.issueSummary" size="small" title="问题汇总">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.issueSummary }}
        </div>
      </Card>

      <Card v-if="props.report.tomorrowPlan" size="small" title="明日计划">
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.tomorrowPlan }}
        </div>
      </Card>

      <Card
        v-if="props.report.coordinationNeeded"
        size="small"
        title="需要协调事项"
      >
        <div class="whitespace-pre-wrap text-sm">
          {{ props.report.coordinationNeeded }}
        </div>
      </Card>

      <Card
        v-if="props.report.attachments && props.report.attachments.length > 0"
        size="small"
        title="现场照片"
      >
        <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
          <Image
            v-for="url in props.report.attachments"
            :key="url"
            :src="url"
            class="rounded object-cover"
            :height="120"
          />
        </div>
      </Card>
    </div>
    <template #footer>
      <Space>
        <Button @click="emit('update:open', false)">关闭</Button>
      </Space>
    </template>
  </Drawer>
</template>
