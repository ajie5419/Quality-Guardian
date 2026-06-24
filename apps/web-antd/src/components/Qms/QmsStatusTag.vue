<script lang="ts" setup>
import type { QmsStatusType } from '#/views/qms/shared/utils/status-ui';

import { computed } from 'vue';

import { Tag } from 'ant-design-vue';

import { resolveQmsStatusUi } from '#/views/qms/shared/utils/status-ui';

interface Props {
  /**
   * The status value (e.g., 'OPEN', 'PASS', 'IN_PROGRESS')
   */
  status: string;
  /**
   * The module type to determine rendering logic
   */
  type: QmsStatusType;
}

const props = defineProps<Props>();
const statusConfig = computed(() =>
  resolveQmsStatusUi(props.status, props.type),
);
</script>

<template>
  <Tag :color="statusConfig.color">
    {{ statusConfig.text }}
  </Tag>
</template>
