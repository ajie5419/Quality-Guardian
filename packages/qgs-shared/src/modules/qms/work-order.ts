export interface WorkOrderItem {
  id: string;
  workOrderNumber: string;
  division?: string;
  customerName: string;
  projectName?: string;
  quantity: number;
  deliveryDate: string;
  status: 'Closed' | 'Completed' | 'In Progress' | 'Pending';
  createTime: string;
  effectiveTime?: string;
}
