export interface WeeklyReportData {
  author: {
    dept: string;
    leader: string;
    name: string;
    role: string;
  };
  // 3. 厂外质量问题 (本周所有)
  externalIssues: IssueItem[];
  // 2. 厂内质量问题 (本周所有)
  internalIssues: IssueItem[];

  period: string;

  title: string;

  // 1. 上周问题跟踪情况
  trackingIssues: Array<{
    completionTime: string;
    description: string;
    id: string;
    progress: string;
    remarks: string;
    respDept: string;
    type: string;
  }>;

  // 4. 本周计划 (手动录入)
  weeklyPlan: Array<{
    content: string;
    goal: string;
    progress: string;
    remarks: string;
  }>;
}

export interface IssueItem {
  cause: string;
  closeTime: string;
  description: string;
  level: string;
  measures: string;
  product: string;
  respDept: string;
}
