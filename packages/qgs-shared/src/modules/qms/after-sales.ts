export interface AfterSalesItem {
  closeDate: string; // 问题关闭日期
  customerName: string; // 客户名称
  defectSubtype?: string; // 缺陷二级分类
  defectType: string; // 缺陷分类
  division?: string; // 事业部
  factoryDate: string; // 出厂日期
  handler: string; // 经办人
  id: string;
  isClaim?: boolean; // 是否索赔
  issueDate: string; // 问题日期
  issueDescription: string; // 问题描述
  laborTravelCost: number; // 人工及差旅费
  location: string; // 项目地点
  materialCost: number; // 材料费
  partName?: string; // 部件名称
  photos?: string[]; // 现场照片
  productSubtype?: string; // 产品二级分类
  productType?: string; // 产品类型
  projectName: string; // 项目名称
  quantity: number; // 数量
  resolutionPlan: string; // 处理意见及方案
  responsibleDept: string; // 责任部门
  runningHours?: number; // 运行小时数
  severity: string; // 严重程度
  status: string; // 状态
  supplierBrand?: string; // 供应商名称/品牌
  warrantyStatus: string; // 在保状态
  workOrderNumber: string; // 工单号
}

export interface AfterSalesParams {
  projectName?: string;
  status?: string;
  supplierBrand?: string;
  workOrderNumber?: string;
  year?: number;
}

export interface AfterSalesStats {
  defectDistribution: { name: string; value: number }[];
  deptDistribution: { name: string; value: number }[];
  kpi: {
    avgTime: number;
    cost: number;
    open: number;
    total: number;
  };
  supplierRanking: {
    categories: string[];
    data: number[];
  };
  trend: {
    category: string[];
    closed: number[];
    costs: number[];
    issues: number[];
  };
}
