<script lang="ts" setup>
import { computed } from 'vue';

import { useI18n } from '@vben/locales';

import { Tag } from 'ant-design-vue';

import { WORK_ORDER_STATUS_UI_MAP } from '#/views/qms/work-order/constants';

interface Props {
  /**
   * The status value (e.g., 'OPEN', 'PASS', 'IN_PROGRESS')
   */
  status: string;
  /**
   * The module type to determine rendering logic
   */
  type: 'after-sales' | 'common' | 'inspection' | 'work-order';
}

const props = defineProps<Props>();
const { t } = useI18n();

const statusConfig = computed(() => {
  const { status, type } = props;
  const normalizedStatus = status ? status.toUpperCase() : '';

  // 1. Inspection Results
  if (type === 'inspection') {
    switch (normalizedStatus) {
      case 'CONDITIONAL': {
        return {
          color: 'orange',
          text: t('qms.inspection.resultValue.CONDITIONAL'),
        };
      }
      case 'FAIL': {
        return { color: 'red', text: t('qms.inspection.resultValue.FAIL') };
      }
      case 'NA': {
        return { color: 'default', text: t('qms.inspection.resultValue.NA') };
      }
      case 'PASS': {
        return { color: 'green', text: t('qms.inspection.resultValue.PASS') };
      }
      default: {
        return { color: 'default', text: status };
      }
    }
  }

  // 2. Work Order Status
  if (type === 'work-order') {
    const config =
      WORK_ORDER_STATUS_UI_MAP[
        normalizedStatus as keyof typeof WORK_ORDER_STATUS_UI_MAP
      ];
    if (config) {
      return {
        color: config.color,
        text: t(config.textKey),
        icon: config.icon,
      };
    }
    return { color: 'default', text: status };
  }

  // 3. After Sales Status
  if (type === 'after-sales') {
    // Logic adapted from useStatusOptions in constants
    /*
      PENDING: orange
      IN_PROGRESS / PROCESSING: blue
      RESOLVED / COMPLETED: green
      CLOSED: gray
      CANCELLED: red
    */
    switch (normalizedStatus) {
      case 'CANCELLED': {
        return { color: 'red', text: t('qms.workOrder.status.cancelled') };
      }
      case 'CLOSED': {
        return { color: 'gray', text: t('qms.afterSales.status.closed') };
      }
      case 'COMPLETED': {
        return { color: 'green', text: t('qms.workOrder.status.completed') };
      }
      case 'IN_PROGRESS':
      case 'PROCESSING': {
        return { color: 'blue', text: t('qms.afterSales.status.processing') };
      }
      case 'OPEN':
      case 'PENDING': {
        return { color: 'orange', text: t('qms.afterSales.status.pending') };
      }
      case 'RESOLVED': {
        return { color: 'green', text: t('qms.afterSales.status.resolved') };
      }
      default: {
        return { color: 'default', text: status };
      }
    }
  }

  // 4. Default / Common
  return { color: 'default', text: status };
});
</script>

<template>
  <Tag :color="statusConfig.color">
    {{ statusConfig.text }}
  </Tag>
</template>
