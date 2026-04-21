export interface WorkOrderItem {
  confirmedRequirements?: number;
  createTime: null | string;
  customerName: null | string;
  deliveryDate: null | string;
  division?: null | string;
  effectiveTime?: null | string;
  id: string; // workOrderNumber
  overdueUnconfirmedRequirements?: number;
  plannedRequirements?: number;
  projectName?: null | string;
  quantity: null | number;
  status: string;
  warrantyStatus?: null | string;
  workOrderNumber: string;
}

export interface WorkOrderSummaryItem {
  division?: null | string;
  quantity: null | number;
  status: string;
}

export interface WorkOrderListResult {
  items: WorkOrderItem[];
  summary: WorkOrderSummaryItem[];
  total: number;
}
