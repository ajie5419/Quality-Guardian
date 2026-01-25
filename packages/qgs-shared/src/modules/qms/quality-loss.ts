export interface QualityLossItem {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string;
  responsibleDepartment: string;
  status: string;
  workOrderNumber?: string;
  projectName?: string;
  partName?: string;
  lossSource?: string;
  actualClaim?: number;
}
