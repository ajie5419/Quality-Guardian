export interface QualityLossItem {
  actualClaim?: number;
  amount: number;
  date: string;
  description: string;
  id: string;
  lossSource?: string;
  partName?: string;
  projectName?: string;
  responsibleDepartment: string;
  status: string;
  type: string;
  workOrderNumber?: string;
}
