export interface QualityLossItem {
  id: string; // 界面显示的 ID (e.g. INT-1, EXT-5)
  pk: string; // 数据库主键 ID
  date: string | null;
  amount: number;
  actualClaim: number;
  responsibleDepartment: string | null;
  lossSource: string;
  workOrderNumber: string;
  projectName: string;
  partName: string;
  status: string;
  type?: string;
  description?: string;
  createdAt?: string;
}

export interface QualityLossServiceTrendItem {
  period: string;
  totalAmount: number;
  manualAmount: number;
  internalAmount: number;
  externalAmount: number;
}
