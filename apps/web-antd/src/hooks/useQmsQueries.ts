/**
 * QMS 数据查询缓存 Hooks
 * 使用 @tanstack/vue-query 实现数据缓存，避免重复请求
 */
import type { DashboardData } from '@qgs/shared';

import { useQuery, useQueryClient } from '@tanstack/vue-query';

import { getAfterSalesList } from '#/api/qms/after-sales';
import {
  getInspectionIssues,
  getInspectionRecords,
} from '#/api/qms/inspection';
import { getBomList } from '#/api/qms/planning';
import { getQualityLossList } from '#/api/qms/quality-loss';
import { getSupplierList } from '#/api/qms/supplier';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getWorkspaceData } from '#/api/qms/workspace';
import { requestClient } from '#/api/request';

// 缓存时间配置
const STALE_TIME = 5 * 60 * 1000; // 5分钟内不重新请求
const GC_TIME = 10 * 60 * 1000; // 10分钟后清理缓存

// ========== 工单管理 ==========
export function useWorkOrdersQuery() {
  return useQuery({
    queryKey: ['workOrders'],
    queryFn: () => getWorkOrderList(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 检验记录 ==========
export function useInspectionRecordsQuery() {
  return useQuery({
    queryKey: ['inspectionRecords'],
    queryFn: () => getInspectionRecords(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 工程问题 ==========
export function useInspectionIssuesQuery() {
  return useQuery({
    queryKey: ['inspectionIssues'],
    queryFn: () => getInspectionIssues(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 售后问题 ==========
export function useAfterSalesQuery() {
  return useQuery({
    queryKey: ['afterSales'],
    queryFn: () => getAfterSalesList(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 质量损失 ==========
export function useQualityLossQuery() {
  return useQuery({
    queryKey: ['qualityLoss'],
    queryFn: () => getQualityLossList(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 供应商 ==========
export function useSupplierQuery() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => getSupplierList(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 项目 BOM ==========
export function useBomQuery() {
  return useQuery({
    queryKey: ['bom'],
    queryFn: () => getBomList(),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });
}

// ========== 工作台数据 ==========
export function useWorkspaceQuery() {
  return useQuery({
    queryKey: ['workspace'],
    queryFn: () => getWorkspaceData(),
    staleTime: 2 * 60 * 1000, // 2分钟缓存（工作台数据更新更频繁）
    gcTime: 5 * 60 * 1000,
  });
}

// ========== 仪表盘数据 ==========
export function useDashboardQuery() {
  return useQuery({
    gcTime: 10 * 60 * 1000,
    queryFn: () => requestClient.get<DashboardData>('/qms/dashboard'),
    queryKey: ['dashboard'],
    staleTime: 5 * 60 * 1000, // 5分钟缓存
  });
}

// ========== 缓存失效辅助函数 ==========
export function useInvalidateQmsQueries() {
  const queryClient = useQueryClient();

  return {
    // 刷新工单缓存
    invalidateWorkOrders: () =>
      queryClient.invalidateQueries({ queryKey: ['workOrders'] }),
    // 刷新检验记录缓存
    invalidateInspectionRecords: () =>
      queryClient.invalidateQueries({ queryKey: ['inspectionRecords'] }),
    // 刷新工程问题缓存
    invalidateInspectionIssues: () =>
      queryClient.invalidateQueries({ queryKey: ['inspectionIssues'] }),
    // 刷新售后问题缓存
    invalidateAfterSales: () =>
      queryClient.invalidateQueries({ queryKey: ['afterSales'] }),
    // 刷新质量损失缓存
    invalidateQualityLoss: () =>
      queryClient.invalidateQueries({ queryKey: ['qualityLoss'] }),
    // 刷新所有 QMS 缓存
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: ['workOrders'] });
      queryClient.invalidateQueries({ queryKey: ['inspectionRecords'] });
      queryClient.invalidateQueries({ queryKey: ['inspectionIssues'] });
      queryClient.invalidateQueries({ queryKey: ['afterSales'] });
      queryClient.invalidateQueries({ queryKey: ['qualityLoss'] });
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
    },
  };
}
