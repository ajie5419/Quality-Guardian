<script lang="ts" setup>
import type { PlanningTreeNode } from '../types';

import { computed } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import { useI18n } from '@vben/locales';

import { Button, Dropdown } from 'ant-design-vue';

const props = defineProps<{
  /** 权限前缀，如 'QMS:Planning:DFMEA' */
  authPrefix?: string;
  /** 是否显示归档按钮 */
  canArchive?: boolean;
  /** 是否显示删除按钮 */
  canDelete?: boolean;
  /** 是否显示编辑按钮 */
  canEdit?: boolean;
  /** 当前项目节点 */
  project: PlanningTreeNode;
  /** 项目类型标识 */
  projectType?: string;
}>();

const emit = defineEmits<{
  (e: 'archive', project: PlanningTreeNode): void;
  (e: 'delete', project: PlanningTreeNode): void;
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
    return hasAccessByCodes([`${props.authPrefix}:Archive`]);
  }
  return true;
});

// 判断状态
const isArchived = computed(() => {
  const s = String(props.project.status || '').toLowerCase();
  return ['archived', 'closed', 'completed', '已完成', '已归档'].includes(s);
});

// 下拉菜单项
const menuItems = computed(() => {
  const items: any[] = [];

  if (canEditAction.value) {
    items.push({
      key: 'edit',
      label: t('common.edit'),
      onClick: () => emit('edit', props.project),
    });
  }

  if (canArchiveAction.value) {
    items.push({
      key: 'archive',
      label: isArchived.value ? t('common.restore') : t('common.archive'),
      onClick: () => emit('archive', props.project),
    });
  }

  if (canDeleteAction.value) {
    items.push({
      danger: true,
      key: 'delete',
      label: t('common.delete'),
      onClick: () => emit('delete', props.project),
    });
  }

  return items;
});
</script>

<template>
  <Dropdown :menu="{ items: menuItems }" trigger="click">
    <Button type="text" size="small" class="text-gray-400 hover:text-gray-600">
      <IconifyIcon icon="lucide:more-vertical" class="size-4" />
    </Button>
  </Dropdown>
</template>
