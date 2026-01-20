import { WorkOrderStatusEnum } from '#/api/qms/enums';

/**
 * Work Order Status UI Map
 */
export const WORK_ORDER_STATUS_UI_MAP: Record<string, { color: string; textKey: string; defaultText: string }> = {
  [WorkOrderStatusEnum.PENDING]: { 
    color: 'orange', 
    textKey: 'qms.workOrder.status.pending',
    defaultText: '未开始'
  },
  [WorkOrderStatusEnum.IN_PROGRESS]: { 
    color: 'blue', 
    textKey: 'qms.workOrder.status.inProgress',
    defaultText: '进行中'
  },
  [WorkOrderStatusEnum.COMPLETED]: { 
    color: 'green', 
    textKey: 'qms.workOrder.status.completed',
    defaultText: '已完成'
  },
};
