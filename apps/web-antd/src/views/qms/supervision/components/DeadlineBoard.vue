<script lang="ts" setup>
import { onMounted, ref } from 'vue';

import {
  Card,
  Empty,
  Progress,
  Segmented,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import { useDeadlineBoard } from '../composables/useDeadlineBoard';
import { formatPlanTaskDate, planTaskColor, planTaskLabel } from '../constants';

const { board, loadBoard, loading } = useDeadlineBoard();
const viewMode = ref<'byProject' | 'byStatus'>('byStatus');

const viewOptions = [
  { label: '按状态', value: 'byStatus' },
  { label: '按项目', value: 'byProject' },
];

const projectColumns = [
  { dataIndex: 'projectName', title: '项目' },
  { dataIndex: 'supplierName', title: '供应商' },
  { dataIndex: 'delayedCount', title: '逾期', width: 80 },
  { dataIndex: 'dueSoonCount', title: '临期', width: 80 },
  { dataIndex: 'riskCount', title: '风险', width: 80 },
];

onMounted(() => loadBoard());
</script>

<template>
  <Spin :spinning="loading">
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <div class="text-lg font-medium">纳期管控看板</div>
        <div class="flex gap-3 text-sm">
          <Tag color="red">逾期 {{ board.summary.delayedCount }}</Tag>
          <Tag color="orange">临期 {{ board.summary.dueSoonCount }}</Tag>
          <Tag color="purple">风险 {{ board.summary.riskCount }}</Tag>
          <Tag color="green">健康度 {{ board.summary.healthyPercent }}%</Tag>
        </div>
      </div>
      <Segmented v-model:value="viewMode" :options="viewOptions" size="small" />
    </div>

    <div
      v-if="viewMode === 'byStatus'"
      class="grid grid-cols-1 gap-4 md:grid-cols-3"
    >
      <Card size="small" title="已逾期" class="border-red-200">
        <template #extra
          ><Tag color="red">{{ board.delayed.length }}</Tag></template
        >
        <Empty v-if="board.delayed.length === 0" description="无逾期任务" />
        <div v-else class="max-h-96 space-y-2 overflow-y-auto">
          <div
            v-for="task in board.delayed"
            :key="task.id"
            class="rounded border border-red-100 bg-red-50 px-3 py-2"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {{ task.taskName }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ task.projectName }} · {{ task.supplierName }}
                </div>
              </div>
              <Tag :color="planTaskColor(task.status)" size="small">
                {{ planTaskLabel(task.status) }}
              </Tag>
            </div>
            <div
              class="mt-1 flex items-center justify-between text-xs text-gray-500"
            >
              <span>计划完成：{{ formatPlanTaskDate(task.plannedEndAt) }}</span>
              <Progress
                :percent="task.progressPercent"
                size="small"
                :show-info="false"
                class="w-16"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card size="small" title="临期（7天内）" class="border-orange-200">
        <template #extra
          ><Tag color="orange">{{ board.dueSoon.length }}</Tag></template
        >
        <Empty v-if="board.dueSoon.length === 0" description="无临期任务" />
        <div v-else class="max-h-96 space-y-2 overflow-y-auto">
          <div
            v-for="task in board.dueSoon"
            :key="task.id"
            class="rounded border border-orange-100 bg-orange-50 px-3 py-2"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {{ task.taskName }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ task.projectName }} · {{ task.supplierName }}
                </div>
              </div>
              <Tag :color="planTaskColor(task.status)" size="small">
                {{ planTaskLabel(task.status) }}
              </Tag>
            </div>
            <div
              class="mt-1 flex items-center justify-between text-xs text-gray-500"
            >
              <span>截止：{{ formatPlanTaskDate(task.plannedEndAt) }}</span>
              <Progress
                :percent="task.progressPercent"
                size="small"
                :show-info="false"
                class="w-16"
              />
            </div>
          </div>
        </div>
      </Card>

      <Card size="small" title="风险" class="border-purple-200">
        <template #extra
          ><Tag color="purple">{{ board.risk.length }}</Tag></template
        >
        <Empty v-if="board.risk.length === 0" description="无风险任务" />
        <div v-else class="max-h-96 space-y-2 overflow-y-auto">
          <div
            v-for="task in board.risk"
            :key="task.id"
            class="rounded border border-purple-100 bg-purple-50 px-3 py-2"
          >
            <div class="flex items-center justify-between">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">
                  {{ task.taskName }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ task.projectName }} · {{ task.supplierName }}
                </div>
              </div>
              <Tag :color="planTaskColor(task.status)" size="small">
                {{ planTaskLabel(task.status) }}
              </Tag>
            </div>
            <div
              class="mt-1 flex items-center justify-between text-xs text-gray-500"
            >
              <span>截止：{{ formatPlanTaskDate(task.plannedEndAt) }}</span>
              <Progress
                :percent="task.progressPercent"
                size="small"
                :show-info="false"
                class="w-16"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>

    <div v-else>
      <Table
        :columns="projectColumns"
        :data-source="board.byProject"
        :pagination="false"
        row-key="projectId"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'delayedCount'">
            <Tag v-if="record.delayedCount > 0" color="red">{{
              record.delayedCount
            }}</Tag>
            <span v-else class="text-gray-400">0</span>
          </template>
          <template v-if="column.dataIndex === 'dueSoonCount'">
            <Tag v-if="record.dueSoonCount > 0" color="orange">{{
              record.dueSoonCount
            }}</Tag>
            <span v-else class="text-gray-400">0</span>
          </template>
          <template v-if="column.dataIndex === 'riskCount'">
            <Tag v-if="record.riskCount > 0" color="purple">{{
              record.riskCount
            }}</Tag>
            <span v-else class="text-gray-400">0</span>
          </template>
        </template>
      </Table>
    </div>
  </Spin>
</template>
