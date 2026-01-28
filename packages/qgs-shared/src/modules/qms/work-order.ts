export interface WorkOrderItem {
  createTime: string;
  customerName: string;
  deliveryDate: string;
  division?: string;
  effectiveTime?: string;
  id: string;
  projectName?: string;
  quantity: number;
  status: 'Closed' | 'Completed' | 'In Progress' | 'Pending';
  workOrderNumber: string;
}
