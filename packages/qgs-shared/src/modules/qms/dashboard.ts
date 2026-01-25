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
  title: string;
  status: string;
  priority: string;
}

export interface DashboardData {
  overview: DashboardOverview;
  chartData: {
    issueDistribution: DashboardChartItem[];
    monthlyQuality: DashboardChartItem[];
  };
  recentWorkOrders: DashboardWorkOrder[];
}

/**
 * Pass Rate Trend Item
 */
export interface PassRateTrendItem {
  period: string; // e.g., 'W1', '2024-01'
  label: string;
  passRate: number;
  totalCount: number;
  passCount: number;
}

/**
 * Pass Rate Drill Down Item
 */
export interface PassRateDrillDownItem {
  category: string;
  passCount: number;
  passRate: number;
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
  shipped: number;
  rate: number;
}

/**
 * Vehicle Failure Item
 */
export interface VehicleFailureItem {
  model: string; // Model
  failureRate: number; // Failure Rate
  totalVehicles: number; // Total Vehicles
  failedVehicles: number; // Failed Vehicles
  category?: string; // Failure Category
}

/**
 * Vehicle Failure Response
 */
export interface VehicleFailureResponse {
  range: string;
  data?: VehicleFailureItem[];
  ranking?: VehicleRankingItem[];
  trend?: VehicleTrendItem[];
}
