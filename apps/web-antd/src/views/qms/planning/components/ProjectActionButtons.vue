<script lang="ts" setup>
import type { MenuProps } from 'ant-design-vue';

import type { PlanningTreeNode } from '../types';

import { computed } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { useI18n } from '@vben/locales';

import { Button, Dropdown, Menu, Tooltip } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    authPrefix?: string;
    canArchive?: boolean;
    canDelete?: boolean;
    canDispatch?: boolean;
    canEdit?: boolean;
    /** 显示模式: 'dropdown' | 'header' | 'table' */
    mode?: 'dropdown' | 'header' | 'table';
    project: PlanningTreeNode;
    projectType?: string;
    size?: 'large' | 'middle' | 'small';
  }>(),
  {
    mode: 'dropdown',
    size: 'small',
    canArchive: true,
    canDelete: true,
    canDispatch: false,
    canEdit: true,
    authPrefix: undefined,
    projectType: undefined,
  },
);

const emit = defineEmits<{
  (e: 'archive', project: PlanningTreeNode): void;
  (e: 'delete', project: PlanningTreeNode): void;
  (e: 'dispatch', project: PlanningTreeNode): void;
  (e: 'edit', project: PlanningTreeNode): void;
}>();

const { t } = useI18n();
const { hasAccessByCodes } = useAccess();

// 权限计算
const canEditAction = computed(() => {
  if (props.canEdit === false) return false;
  if (props.authPrefix) {
    return hasAccessByCodes([`${props.authPrefix}:Edit`]);
  }
  return true;
});

const canDeleteAction = computed(() => {
  if (props.canDelete === false) return false;
  if (props.authPrefix) {
    return hasAccessByCodes([`${props.authPrefix}:Delete`]);
  }
  return true;
});

const canArchiveAction = computed(() => {
  if (props.canArchive === false) return false;
  if (props.authPrefix) {
    // 归档权限通常属于编辑范围，如果没有专门的 Archive 权限则降级检查 Edit
    return hasAccessByCodes([
      `${props.authPrefix}:Archive`,
      `${props.authPrefix}:Edit`,
    ]);
  }
  return true;
});

const canDispatchAction = computed(() => {
  if (props.canDispatch === false) return false;
  if (props.authPrefix) {
    return hasAccessByCodes([`${props.authPrefix}:Dispatch`]);
  }
  return true;
});

// 判断状态
const isArchived = computed(() => {
  if (!props.project) return false;
  const s = String(props.project.status || '').toLowerCase();
  return ['archived', 'closed', 'completed', '已完成', '已归档'].includes(s);
});

// 菜单点击处理
const handleMenuClick: MenuProps['onClick'] = (e) => {
  e.domEvent.stopPropagation();
  switch (e.key) {
    case 'archive': {
      emit('archive', props.project);
      break;
    }
    case 'delete': {
      emit('delete', props.project);
      break;
    }
    case 'dispatch': {
      emit('dispatch', props.project);
      break;
    }
    case 'edit': {
      emit('edit', props.project);
      break;
    }
  }
};

// 更多菜单项（用于 header/table 模式中不直接展示的按钮）
// 目前 header/table 展示了 Edit 和 Delete，所以这里放 Archive
const hasMoreActions = computed(() => {
  return canArchiveAction.value;
});
</script>

<template>
  <div v-if="mode === 'dropdown'">
    <Dropdown trigger="click">
      <Button
        type="text"
        :size="size"
        class="flex size-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600"
        @click.stop
      >
        <IconifyIcon icon="lucide:ellipsis-vertical" class="size-4" />
      </Button>
      <template #overlay>
        <Menu @click="handleMenuClick">
          <Menu.Item v-if="canDispatchAction" key="dispatch">
            <template #icon>
              <IconifyIcon icon="lucide:check-circle-2" class="size-4" />
            </template>
            <span>{{ t('common.dispatch') }}</span>
          </Menu.Item>

          <Menu.Item v-if="canEditAction" key="edit">
            <template #icon>
              <IconifyIcon icon="lucide:edit" class="size-4" />
            </template>
            <span>{{ t('common.edit') }}</span>
          </Menu.Item>

          <Menu.Item v-if="canArchiveAction" key="archive">
            <template #icon>
              <IconifyIcon
                :icon="isArchived ? 'lucide:rotate-ccw' : 'lucide:archive'"
                class="size-4"
              />
            </template>
            <span>{{
              isArchived ? t('common.restore') : t('common.archive')
            }}</span>
          </Menu.Item>

          <Menu.Divider
            v-if="canDeleteAction && (canEditAction || canArchiveAction)"
          />

          <Menu.Item v-if="canDeleteAction" key="delete" danger>
            <template #icon>
              <IconifyIcon icon="lucide:trash-2" class="size-4" />
            </template>
            <span>{{ t('common.delete') }}</span>
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
  </div>

  <div v-else-if="mode === 'header'" class="flex items-center gap-2">
    <Button
      v-if="canEditAction"
      type="link"
      :size="size"
      class="h-auto p-0 text-blue-600 hover:text-blue-700"
      @click="emit('edit', project)"
    >
      <IconifyIcon icon="lucide:edit" class="mr-1 size-3.5" />
      {{ t('common.edit') }}
    </Button>

    <Button
      v-if="canArchiveAction"
      type="link"
      :size="size"
      class="h-auto p-0 transition-all"
      :class="
        isArchived
          ? 'text-gray-500 hover:text-blue-600'
          : 'text-orange-500 hover:text-orange-600'
      "
      @click="emit('archive', project)"
    >
      <IconifyIcon
        :icon="isArchived ? 'lucide:rotate-ccw' : 'lucide:archive'"
        class="mr-1 size-3.5"
      />
      {{ isArchived ? t('common.restore') : t('common.archive') }}
    </Button>

    <Button
      v-if="canDeleteAction"
      type="link"
      danger
      :size="size"
      class="h-auto p-0"
      @click="emit('delete', project)"
    >
      <IconifyIcon icon="lucide:trash-2" class="mr-1 size-3.5" />
      {{ t('common.delete') }}
    </Button>
  </div>

  <div v-else-if="mode === 'table'" class="flex items-center gap-1">
    <Tooltip v-if="canEditAction" :title="t('common.edit')">
      <Button type="link" :size="size" @click="emit('edit', project)">
        <IconifyIcon icon="lucide:edit" class="size-4" />
      </Button>
    </Tooltip>
    <Tooltip v-if="canDeleteAction" :title="t('common.delete')">
      <Button type="link" danger :size="size" @click="emit('delete', project)">
        <IconifyIcon icon="lucide:trash-2" class="size-4" />
      </Button>
    </Tooltip>
    <Dropdown v-if="hasMoreActions" trigger="click">
      <Button type="link" :size="size" class="text-gray-400">
        <IconifyIcon icon="lucide:more-horizontal" class="size-4" />
      </Button>
      <template #overlay>
        <Menu @click="handleMenuClick">
          <Menu.Item v-if="canArchiveAction" key="archive">
            <template #icon>
              <IconifyIcon
                :icon="isArchived ? 'lucide:rotate-ccw' : 'lucide:archive'"
                class="size-4"
              />
            </template>
            <span>{{
              isArchived ? t('common.restore') : t('common.archive')
            }}</span>
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
  </div>
</template>
