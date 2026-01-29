export interface DashboardOverview {
  fieldIssues?: { open: number; total: number };
  openIssues: number;
  passRate: number;
  processIssues?: { open: number; total: number };
  qualityLoss: number | { total: number; weekly: number };
  totalInspections: number;
  workOrders?: { total: number; weekly: number };
}

export interface DashboardChartItem {
  month?: string;
  rate?: number;
  type?: string;
  value?: number;
}

export interface DashboardWorkOrder {
  id: string;
  priority: string;
  status: string;
  title: string;
}

export interface DashboardData {
  chartData: {
    issueDistribution: DashboardChartItem[];
    monthlyQuality: DashboardChartItem[];
  };
  overview: DashboardOverview;
  recentWorkOrders: DashboardWorkOrder[];
}

/**
 * Pass Rate Trend Item
 */
export interface PassRateTrendItem {
  label: string;
  passCount: number;
  passRate: number;
  period: string; // e.g., 'W1', '2024-01'
  totalCount: number;
}

/**
 * Pass Rate Drill Down Item
 */
export interface PassRateDrillDownItem {
  category: string;
  passCount: number;
  passRate: number;
  targetPassRate?: number;
  process: string;
  totalCount: number;
}

/**
 * Pass Rate Trend Response
 */
export interface PassRateTrendResponse {
  data: PassRateTrendItem[];
  drillDown?: PassRateDrillDownItem[];
  drillDownAvailable?: boolean;
  granularity: 'month' | 'week';
  trend?: PassRateTrendItem[];
}

/**
 * Quality Loss Trend Item
 */
export interface QualityLossTrendItem {
  amount: number;
  count: number;
  externalAmount?: number;
  internalAmount?: number;
  label: string;
  manualAmount?: number;
  period: string;
}

/**
 * Quality Loss Drill Down Item
 */
export interface QualityLossDrillDownItem {
  amount: number;
  date: string;
  dept: string;
  desc: string;
  id: string;
  type: string;
}

/**
 * Quality Loss Trend Response
 */
export interface QualityLossTrendResponse {
  data: QualityLossTrendItem[];
  drillDown?: QualityLossDrillDownItem[];
  granularity: 'month' | 'week';
  trend?: QualityLossTrendItem[];
}

/**
 * Vehicle Ranking Item
 */
export interface VehicleRankingItem {
  model: string;
  rate: number;
}

/**
 * Vehicle Trend Item
 */
export interface VehicleTrendItem {
  period: string;
  rate: number;
  shipped: number;
}

/**
 * Vehicle Failure Item
 */
export interface VehicleFailureItem {
  category?: string; // Failure Category
  failedVehicles: number; // Failed Vehicles
  failureRate: number; // Failure Rate
  model: string; // Model
  totalVehicles: number; // Total Vehicles
}

/**
 * Vehicle Failure Response
 */
export interface VehicleFailureResponse {
  data?: VehicleFailureItem[];
  range: string;
  ranking?: VehicleRankingItem[];
  trend?: VehicleTrendItem[];
}
