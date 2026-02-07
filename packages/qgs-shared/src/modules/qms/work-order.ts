export interface WorkOrderItem {
  createTime: string | null;
  customerName: string | null;
  deliveryDate: string | null;
  division?: string | null;
  effectiveTime?: string | null;
  id: string; // workOrderNumber
  projectName?: string | null;
  quantity: number | null;
  status: string;
  workOrderNumber: string;
}

export interface WorkOrderSummaryItem {
  status: string;
  division?: string | null;
  quantity: number | null;
}

export interface WorkOrderListResult {
  items: WorkOrderItem[];
  total: number;
  summary: WorkOrderSummaryItem[];
}
