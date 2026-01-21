<script lang="ts" setup generic="T extends PlanningTreeNode">
import type { PlanningTreeNode } from '../types';

import { useI18n } from '@vben/locales';

import { Button, Empty, Input, Tabs, Tag } from 'ant-design-vue';

defineProps<{
  loading?: boolean;
  projects: T[];
  selectedId: null | string;
  /** 显式控制是否显示新建按钮 */
  showCreate?: boolean;
  /** 显式控制是否显示分派按钮 */
  showDispatch?: boolean;
  title: string;
}>();

const emit = defineEmits<{
  archive: [T];
  change: [];
  create: [];
  dispatch: [T];
  'update:activeTab': [string];
  'update:searchText': [string];
  'update:selectedId': [null | string];
}>();

const { t } = useI18n();

const activeTab = defineModel<string>('activeTab', { default: 'active' });
const searchText = defineModel<string>('searchText', { default: '' });

/**
 * 判断是否为归档状态
 */
function isArchived(status?: string) {
  const s = String(status || '').toLowerCase();
  return ['archived', 'closed', 'completed', '已完成', '已归档'].includes(s);
}

function handleSelect(id: string) {
  emit('update:selectedId', id);
}
</script>

<template>
  <div
    class="flex w-80 flex-shrink-0 select-none flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
  >
    <!-- Header: Professional Typography & Modern Button -->
    <div
      class="flex items-center justify-between border-b border-gray-100 bg-gray-50/20 px-4 py-4"
    >
      <span class="text-base font-bold tracking-tight text-gray-800">{{
        title
      }}</span>
      <Button
        v-if="showCreate"
        type="primary"
        size="small"
        @click="emit('create')"
        class="flex h-8 items-center gap-1.5 rounded-md border-none bg-blue-600 px-3 shadow-sm transition-all hover:bg-blue-700 active:scale-95"
      >
        <span class="i-lucide-plus text-sm text-white"></span>
        <span class="text-xs font-semibold text-white">{{
          t('common.add')
        }}</span>
      </Button>
    </div>

    <!-- Navigation & Search -->
    <div class="px-3 pt-2">
      <Tabs
        v-model:active-key="activeTab"
        size="small"
        class="sidebar-tabs"
        @change="emit('change')"
      >
        <Tabs.TabPane key="active" :tab="t('qms.planning.status.active')" />
        <Tabs.TabPane key="archived" :tab="t('qms.planning.status.archived')" />
      </Tabs>
    </div>

    <div class="px-3 pb-3">
      <Input.Search
        v-model:value="searchText"
        :placeholder="t('qms.planning.bom.placeholder.search')"
        allow-clear
        class="sidebar-search"
      />
    </div>

    <!-- Modern Project List -->
    <div class="flex-1 space-y-1.5 overflow-y-auto scroll-smooth p-2">
      <div
        v-for="proj in projects"
        :key="proj.id"
        class="group relative cursor-pointer rounded-lg border p-3 transition-all duration-300"
        :class="
          selectedId === proj.id
            ? 'border-blue-400 bg-blue-50/40 shadow-sm ring-1 ring-blue-100/50'
            : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-gray-50/30'
        "
        @click="handleSelect(proj.id)"
      >
        <!-- Content Area with Safe Right Padding -->
        <div class="relative z-10 pr-24">
          <div
            class="mb-1.5 line-clamp-1 font-bold text-gray-800 transition-colors group-hover:text-blue-700"
          >
            {{ proj.name }}
          </div>

          <div class="flex flex-col gap-1 text-[11px] text-gray-500">
            <slot name="projectInfo" :project="proj">
              <div
                v-if="proj.workOrderNumber || proj.workOrderId"
                class="flex items-center gap-1.5"
              >
                <span class="i-lucide-hash text-[10px] opacity-60"></span>
                <span class="truncate"
                  >{{ t('qms.workOrder.workOrderNumber') }}:
                  {{ proj.workOrderNumber || proj.workOrderId }}</span
                >
              </div>
            </slot>
          </div>
        </div>

        <!-- Status Tag (Top Right) -->
        <div class="absolute right-2 top-3">
          <Tag
            v-if="isArchived(proj.status)"
            color="default"
            class="m-0 scale-90 border-none bg-gray-100 text-gray-500"
          >
            {{ t('qms.planning.status.archived') }}
          </Tag>
        </div>

        <!-- Float Actions: No background, Absolute Right-Bottom -->
        <div
          class="absolute bottom-2.5 right-2 z-20 flex items-center gap-3 transition-all duration-300"
          :class="[
            selectedId === proj.id
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100',
          ]"
        >
          <Button
            v-if="showDispatch && !isArchived(proj.status)"
            type="link"
            size="small"
            class="h-auto p-0 text-[11px] font-bold text-blue-600 hover:underline"
            @click.stop="emit('dispatch', proj)"
          >
            {{ t('common.dispatch') }}
          </Button>
          <Button
            type="link"
            size="small"
            class="h-auto p-0 text-[11px] font-bold"
            :class="
              isArchived(proj.status)
                ? 'text-gray-500 hover:text-blue-600'
                : 'text-orange-500 hover:text-orange-600'
            "
            @click.stop="emit('archive', proj)"
          >
            {{
              isArchived(proj.status)
                ? t('common.restore')
                : t('common.archive')
            }}
          </Button>
        </div>
      </div>

      <Empty
        v-if="projects.length === 0"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        class="py-12 opacity-60"
      />
    </div>
  </div>
</template>

<style scoped>
.line-clamp-1 {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.sidebar-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 8px !important;
}

.sidebar-search :deep(.ant-input-affix-wrapper) {
  background-color: #f9fafb;
  border-radius: 6px;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 10px;
}

.overflow-y-auto:hover::-webkit-scrollbar-thumb {
  background-color: #e5e7eb;
}
</style>
