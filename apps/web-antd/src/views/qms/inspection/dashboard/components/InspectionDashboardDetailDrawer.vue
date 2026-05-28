<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { Drawer, Input, Table } from 'ant-design-vue';

type DetailType = 'inspector' | 'reinspection' | 'team';

interface InspectorStat {
  averageTaskMinutes: number;
  completedTaskCount: number;
  inspector: string;
}

interface ReinspectionStat {
  inspectedCount: number;
  reinspectionCount: number;
  reinspectionRate: number;
  submittedCount: number;
  team: string;
}

interface TeamStat {
  count: number;
  team: string;
}

const props = defineProps<{
  inspectorStats: InspectorStat[];
  open: boolean;
  rangeLabel: string;
  reinspectionStats: ReinspectionStat[];
  teamStats: TeamStat[];
  type: DetailType;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const keyword = ref('');

const drawerTitle = computed(() => {
  if (props.type === 'reinspection') return '班组复检率完整排行';
  if (props.type === 'inspector') return '检验员效率完整排行';
  return '班组报检完整排行';
});

const drawerDescription = computed(() => {
  if (props.type === 'reinspection') {
    return `${props.rangeLabel}各班组复检率、复检数、已检数和报检数。`;
  }
  if (props.type === 'inspector') {
    return `${props.rangeLabel}各检验员完成数量和平均任务时长。`;
  }
  return `${props.rangeLabel}各班组报检数量和占比。`;
});

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase());

const teamTotal = computed(() =>
  props.teamStats.reduce((sum, item) => sum + Number(item.count || 0), 0),
);

const teamRows = computed(() =>
  [...props.teamStats]
    .sort((a, b) => b.count - a.count)
    .map((item, index) => ({
      count: item.count,
      rank: index + 1,
      share:
        teamTotal.value > 0
          ? `${Math.round((item.count / teamTotal.value) * 1000) / 10}%`
          : '0%',
      team: item.team || '未填写',
    }))
    .filter((item) =>
      item.team.toLowerCase().includes(normalizedKeyword.value),
    ),
);

const reinspectionRows = computed(() =>
  [...props.reinspectionStats]
    .sort((a, b) => {
      const rateDiff = b.reinspectionRate - a.reinspectionRate;
      if (rateDiff !== 0) return rateDiff;
      return b.submittedCount - a.submittedCount;
    })
    .map((item, index) => ({
      inspectedCount: item.inspectedCount,
      rank: index + 1,
      reinspectionCount: item.reinspectionCount,
      reinspectionRate: `${item.reinspectionRate}%`,
      submittedCount: item.submittedCount,
      team: item.team || '未填写',
    }))
    .filter((item) =>
      item.team.toLowerCase().includes(normalizedKeyword.value),
    ),
);

const inspectorRows = computed(() =>
  [...props.inspectorStats]
    .sort((a, b) => {
      const countDiff = b.completedTaskCount - a.completedTaskCount;
      if (countDiff !== 0) return countDiff;
      return a.averageTaskMinutes - b.averageTaskMinutes;
    })
    .map((item, index) => ({
      averageTaskMinutes: minutesText(item.averageTaskMinutes),
      completedTaskCount: item.completedTaskCount,
      inspector: item.inspector || '未记录',
      rank: index + 1,
    }))
    .filter((item) =>
      item.inspector.toLowerCase().includes(normalizedKeyword.value),
    ),
);

const pagination = computed(() => ({
  pageSize: 20,
  showSizeChanger: false,
}));

function minutesText(value?: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

function handleOpenChange(value: boolean) {
  emit('update:open', value);
}

watch(
  () => [props.open, props.type],
  () => {
    keyword.value = '';
  },
);
</script>

<template>
  <Drawer
    :open="props.open"
    :title="drawerTitle"
    :width="760"
    destroy-on-close
    @update:open="handleOpenChange"
  >
    <div class="mb-4 text-sm text-gray-500">{{ drawerDescription }}</div>
    <Input.Search
      v-model:value="keyword"
      allow-clear
      class="mb-4"
      placeholder="搜索名称"
    />

    <Table
      v-if="props.type === 'team'"
      :data-source="teamRows"
      :pagination="pagination"
      row-key="rank"
      size="small"
    >
      <Table.Column title="排名" data-index="rank" :width="72" />
      <Table.Column title="班组" data-index="team" />
      <Table.Column title="报检数量" data-index="count" :width="110" />
      <Table.Column title="占比" data-index="share" :width="90" />
    </Table>

    <Table
      v-else-if="props.type === 'reinspection'"
      :data-source="reinspectionRows"
      :pagination="pagination"
      row-key="rank"
      size="small"
    >
      <Table.Column title="排名" data-index="rank" :width="72" />
      <Table.Column title="班组" data-index="team" />
      <Table.Column title="报检数" data-index="submittedCount" :width="90" />
      <Table.Column title="已检数" data-index="inspectedCount" :width="90" />
      <Table.Column title="复检数" data-index="reinspectionCount" :width="90" />
      <Table.Column title="复检率" data-index="reinspectionRate" :width="90" />
    </Table>

    <Table
      v-else
      :data-source="inspectorRows"
      :pagination="pagination"
      row-key="rank"
      size="small"
    >
      <Table.Column title="排名" data-index="rank" :width="72" />
      <Table.Column title="检验员" data-index="inspector" />
      <Table.Column
        title="完成数量"
        data-index="completedTaskCount"
        :width="110"
      />
      <Table.Column
        title="平均任务时长"
        data-index="averageTaskMinutes"
        :width="140"
      />
    </Table>
  </Drawer>
</template>
