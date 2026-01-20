/**
 * Dashboard API 类型定义
 */

export namespace QmsDashboardApi {
  export interface Overview {
    fieldIssues?: { open: number; total: number };
    openIssues: number;
    passRate: number;
    processIssues?: { open: number; total: number };
    qualityLoss: number | { total: number; weekly: number };
    totalInspections: number;
    workOrders?: { total: number; weekly: number };
  }

  export interface ChartItem {
    month?: string;
    rate?: number;
    type?: string;
    value?: number;
  }

  export interface WorkOrder {
    id: string;
    title: string;
    status: string;
    priority: string;
  }

  export interface DashboardData {
    overview: Overview;
    chartData: {
      issueDistribution: ChartItem[];
      monthlyQuality: ChartItem[];
    };
    recentWorkOrders: WorkOrder[];
  }

  /**
   * 合格率趋势数据点
   */
  export interface PassRateTrendItem {
    period: string; // 周期标识，如 'W1', '2024-01'
    label: string; // 显示标签
    passRate: number; // 合格率百分比
    totalCount: number; // 总检验数
    passCount: number; // 合格数
  }

  /**
   * 合格率下钻详情项
   */
  export interface PassRateDrillDownItem {
    category: string;
    passCount: number;
    passRate: number;
    process: string;
    totalCount: number;
  }

  /**
   * 合格率趋势响应
   */
  export interface PassRateTrendResponse {
    data: PassRateTrendItem[];
    drillDown?: PassRateDrillDownItem[];
    drillDownAvailable?: boolean;
    granularity: 'month' | 'week';
    trend?: PassRateTrendItem[];
  }

  /**
   * 质量损失趋势数据点
   */
  export interface QualityLossTrendItem {
    amount: number; // 损失金额
    count: number; // 损失次数
    externalAmount?: number;
    internalAmount?: number;
    label: string;
    manualAmount?: number;
    period: string;
  }

  /**
   * 质量损失下钻详情项
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
   * 质量损失趋势响应
   */
  export interface QualityLossTrendResponse {
    data: QualityLossTrendItem[];
    drillDown?: QualityLossDrillDownItem[];
    granularity: 'month' | 'week';
    trend?: QualityLossTrendItem[];
  }

  /**
   * 车辆故障排行数据项
   */
  export interface VehicleRankingItem {
    model: string;
    rate: number;
  }

  /**
   * 车辆故障趋势数据项
   */
  export interface VehicleTrendItem {
    period: string;
    shipped: number;
    rate: number;
  }

  /**
   * 车辆故障率数据项
   */
  export interface VehicleFailureItem {
    model: string; // 车型
    failureRate: number; // 故障率
    totalVehicles: number; // 总车辆数
    failedVehicles: number; // 故障车辆数
    category?: string; // 故障类别
  }

  /**
   * 车辆故障率响应
   */
  export interface VehicleFailureResponse {
    range: string;
    data?: VehicleFailureItem[];
    ranking?: VehicleRankingItem[];
    trend?: VehicleTrendItem[];
  }
}
