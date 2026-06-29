<script setup lang="ts">
import type { InspectionRequestStatus } from '@qgs/shared';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Segmented, Select } from 'ant-design-vue';

interface Option {
  label: string;
  value: string;
}

interface Props {
  activeView: string;
  isMobile: boolean;
  keyword: string;
  status?: InspectionRequestStatus;
  statusOptions: Option[];
  viewOptions: Option[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  search: [];
  statusChange: [];
  updateActiveView: [value: string];
  updateKeyword: [value: string];
  updateStatus: [value?: InspectionRequestStatus];
  viewChange: [value: number | string];
}>();

function handleStatusUpdate(value: unknown) {
  emit('updateStatus', value as InspectionRequestStatus | undefined);
}
</script>

<template>
  <div
    class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"
  >
    <Segmented
      :value="props.activeView"
      :block="props.isMobile"
      :options="props.viewOptions"
      @change="(value) => emit('viewChange', value)"
      @update:value="(value) => emit('updateActiveView', String(value))"
    />
    <div
      class="flex flex-wrap items-center gap-2"
      :class="props.isMobile ? 'w-full' : ''"
    >
      <Input
        :value="props.keyword"
        allow-clear
        :class="props.isMobile ? 'w-full' : 'w-64'"
        placeholder="搜索报检任务"
        @press-enter="emit('search')"
        @update:value="(value) => emit('updateKeyword', String(value || ''))"
      />
      <Select
        :value="props.status"
        allow-clear
        :class="props.isMobile ? 'w-full' : 'w-36'"
        :options="props.statusOptions"
        placeholder="状态"
        @change="emit('statusChange')"
        @update:value="handleStatusUpdate"
      />
      <Button @click="emit('search')">
        <template #icon>
          <IconifyIcon icon="lucide:search" />
        </template>
        查询
      </Button>
    </div>
  </div>
</template>
