export interface ReportItem {
  id: string;
  date: string;
  totalInspections: number;
  passRate: number;
  majorDefects: number;
  minorDefects: number;
  status: 'Draft' | 'Published';
  author: string;
}

export interface DailySummaryData {
  reporter: string;
  date: string;
  inspections: Array<{
    partName: string;
    process: string;
    projectName: string;
    quantity: number;
    result: string;
    seq: number;
    workOrder: string;
  }>;
  issues: Array<{
    dept: string;
    description: string;
    isToday: boolean;
    partName: string;
    seq: number;
    solution: string;
    status: string;
    workOrder: string;
  }>;
  summary: string;
}

export interface QualityReportSummary {
  defects: Array<{ name: string; value: number }>;
  majorEvents: Array<{
    date: string;
    desc: string;
    id: string;
    loss: number;
    project: string;
    status: string;
    title: string;
  }>;
  metrics: Array<{
    desc: string;
    history: number[];
    label: string;
    trend: number;
    unit: string;
    value: number;
  }>;
  period: string;
  suppliers: {
    best: Array<{ issues: number; name: string }>;
    worst: Array<{ issues: number; name: string }>;
  };
  title: string;
  topProjects: Array<{
    issues: number;
    loss: number;
    name: string;
  }>;
}
