export interface ReportItem {
  author: string;
  date: string;
  id: string;
  majorDefects: number;
  minorDefects: number;
  passRate: number;
  status: 'Draft' | 'Published';
  totalInspections: number;
}

export interface DailySummaryData {
  archiveStats?: {
    archivedCount: number;
    missingTemplateCount?: number;
    overdueCount: number;
    requiredCount: number;
    timelinessRate: number;
  };
  date: string;
  documentItems: Array<{
    projectName: string;
    seq: number;
    status: string;
    workContent: string;
    workOrder: string;
  }>;
  engineeringTodos?: Array<{
    processName: string;
    projectName: string;
    seq: number;
    status: string;
    workOrder: string;
  }>;
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
    projectName: string;
    seq: number;
    solution: string;
    status: string;
    workOrder: string;
  }>;
  reporter: string;
  summary: string;
}

export interface QualityReportSummary {
  defects: Array<{ name: string; value: number }>;
  historyLabels?: string[];
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
  processPassRates?: Array<{
    category: string;
    passed: number;
    passRate: number;
    processName: string;
    targetPassRate: number;
    total: number;
  }>;
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
