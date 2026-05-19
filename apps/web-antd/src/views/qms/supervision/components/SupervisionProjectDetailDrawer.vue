<script lang="ts" setup>
import type { SupervisionProject } from '@qgs/shared';

import { Button, Drawer, Progress, Space, Tag } from 'ant-design-vue';

interface Props {
  open: boolean;
  project?: SupervisionProject;
  projectStatusColor: (value?: string) => string;
  statusLabel: (value?: string) => string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  edit: [project: SupervisionProject];
  'update:open': [value: boolean];
  viewPlan: [project: SupervisionProject];
}>();

function handleUpdateOpen(value: boolean) {
  emit('update:open', value);
}

function handleViewPlan() {
  if (!props.project) return;
  emit('update:open', false);
  emit('viewPlan', props.project);
}

function handleEdit() {
  if (!props.project) return;
  emit('update:open', false);
  emit('edit', props.project);
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="监造项目详情"
    width="640"
    @update:open="handleUpdateOpen"
  >
    <div v-if="props.project" class="space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-lg font-semibold">
            {{ props.project.projectName }}
          </div>
        </div>
        <Space wrap>
          <Tag :color="props.projectStatusColor(props.project.status)">
            {{ props.statusLabel(props.project.status) }}
          </Tag>
        </Space>
      </div>

      <Progress :percent="props.project.progressPercent" />

      <div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-2">
        <div class="rounded bg-blue-50 px-3 py-2 text-blue-700">
          <div class="text-xs">未闭环问题</div>
          <div class="font-semibold">
            {{ props.project.openIssueCount || 0 }} /
            {{ props.project.totalIssueCount || 0 }}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div>
          <div class="text-xs text-gray-500">供应商</div>
          <div>{{ props.project.supplierName || '-' }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500">监造人员</div>
          <div>{{ props.project.supervisor || '-' }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500">计划周期</div>
          <div>
            {{ props.project.plannedStartAt || '-' }} 至
            {{ props.project.plannedEndAt || '-' }}
          </div>
        </div>
      </div>

      <div>
        <div class="text-xs text-gray-500">项目说明</div>
        <div class="mt-1 whitespace-pre-wrap text-sm">
          {{ props.project.summary || '-' }}
        </div>
      </div>
    </div>
    <template #footer>
      <Space>
        <Button @click="emit('update:open', false)">关闭</Button>
        <Button v-if="props.project" @click="handleViewPlan">甘特计划</Button>
        <Button v-if="props.project" type="primary" @click="handleEdit">
          编辑
        </Button>
      </Space>
    </template>
  </Drawer>
</template>
