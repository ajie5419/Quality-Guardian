export interface QualityLossItem {
  actualClaim: number;
  amount: number;
  createdAt?: string;
  date: null | string;
  description?: string;
  id: string; // 界面显示的 ID (e.g. INT-1, EXT-5)
  lossSource: string;
  partName: string;
  pk: string; // 数据库主键 ID
  projectName: string;
  responsibleDepartment: null | string;
  status: string;
  type?: string;
  workOrderNumber: string;
}

export interface QualityLossServiceTrendItem {
  externalAmount: number;
  internalAmount: number;
  manualAmount: number;
  period: string;
  totalAmount: number;
}
