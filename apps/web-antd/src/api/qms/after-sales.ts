import { requestClient } from '#/api/request';

export namespace QmsAfterSalesApi {
  export interface AfterSalesItem {
    id: string;
    workOrderNumber: string; // 工单号
    division?: string; // 事业部
    projectName: string; // 项目名称
    customerName: string; // 客户名称
    location: string; // 项目地点
    factoryDate: string; // 出厂日期
    warrantyStatus: string; // 在保状态
    issueDescription: string; // 问题描述
    quantity: number; // 数量
    issueDate: string; // 问题日期
    handler: string; // 经办人
    resolutionPlan: string; // 处理意见及方案
    responsibleDept: string; // 责任部门
    materialCost: number; // 材料费
    laborTravelCost: number; // 人工及差旅费
    closeDate: string; // 问题关闭日期
    status: string; // 状态
    defectType: string; // 缺陷分类
    defectSubtype?: string; // 缺陷二级分类
    productType?: string; // 产品类型
    productSubtype?: string; // 产品二级分类
    runningHours?: number; // 运行小时数
    severity: string; // 严重程度
    isClaim?: boolean; // 是否索赔
    supplierBrand?: string; // 供应商名称/品牌
    partName?: string; // 部件名称
    photos?: string[]; // 现场照片
  }

  export interface AfterSalesParams {
    projectName?: string;
    status?: string;
    supplierBrand?: string;
    workOrderNumber?: string;
    year?: number;
  }

  export interface AfterSalesStats {
    kpi: {
      avgTime: number;
      cost: number;
      open: number;
      total: number;
    };
    trend: {
      category: string[];
      closed: number[];
      costs: number[];
      issues: number[];
    };
    defectDistribution: { name: string; value: number }[];
    supplierRanking: {
      categories: string[];
      data: number[];
    };
    deptDistribution: { name: string; value: number }[];
  }
}

/**
 * Get After-sales list
 */
export async function getAfterSalesList(
  params?: QmsAfterSalesApi.AfterSalesParams,
) {
  return requestClient.get<QmsAfterSalesApi.AfterSalesItem[]>(
    '/qms/after-sales',
    { params },
  );
}

/**
 * Get After-sales statistics
 */
export async function getAfterSalesStats(params?: { year?: number }) {
  return requestClient.get<QmsAfterSalesApi.AfterSalesStats>(
    '/qms/after-sales/stats',
    { params },
  );
}

/**
 * Create After-sales record
 */
export async function createAfterSales(
  data: Partial<QmsAfterSalesApi.AfterSalesItem>,
) {
  return requestClient.post<QmsAfterSalesApi.AfterSalesItem>(
    '/qms/after-sales',
    data,
  );
}

export async function updateAfterSales(
  id: string,
  data: Partial<QmsAfterSalesApi.AfterSalesItem>,
) {
  return requestClient.put<QmsAfterSalesApi.AfterSalesItem>(
    `/qms/after-sales/${id}`,
    data,
  );
}

export async function deleteAfterSales(id: string) {
  return requestClient.delete(`/qms/after-sales/${id}`);
}
