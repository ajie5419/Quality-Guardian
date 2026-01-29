import type { SupplierItem, WorkOrderItem } from '../types';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getSupplierList } from '#/api/qms/supplier';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getDeptList } from '#/api/system/dept';
import { convertToTreeSelectData } from '#/types';

import { UI_CONSTANTS } from '../constants';

/**
 * 质量问题数据加载 Composable
 */
export function useIssueData() {
  const { t } = useI18n();

  const deptTreeData = ref<any[]>([]);
  const deptRawData = ref<any[]>([]);
  const workOrderList = ref<WorkOrderItem[]>([]);
  const supplierList = ref<SupplierItem[]>([]);
  const isLoading = ref(false);

  /**
   * 加载初始数据（部门、工单、供应商）
   */
  async function loadInitialData() {
    isLoading.value = true;
    try {
      const [deptRes, workOrderRes, supplierRes] = await Promise.all([
        getDeptList(),
        // 默认加载最近的 200 条工单，忽略年份限制，提高"不搜索"时的可见性
        getWorkOrderList({ pageSize: 200, ignoreYearFilter: true }),
        getSupplierList({ pageSize: UI_CONSTANTS.SUPPLIER_PAGE_SIZE }),
      ]);

      deptRawData.value = deptRes as any[];
      deptTreeData.value = convertToTreeSelectData(deptRes) as any[];
      workOrderList.value = (workOrderRes as any).items || [];
      // 包含所有类型的供应商和外协单位
      supplierList.value = (supplierRes as any).items || [];
    } catch (error) {
      console.error('Failed to load initial data', error);
      const errorMessage =
        error instanceof Error ? error.message : t('common.loadDataFailed');
      message.error(errorMessage);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 搜索工单 (用于下拉框远程搜索)
   */
  async function searchWorkOrders(text: string) {
    // console.log('Searching work orders with keyword:', text);
    try {
      // 如果关键词为空，加载默认列表 (使用更大的 pageSize)
      const params = text.trim()
        ? { keyword: text.trim(), pageSize: 50, ignoreYearFilter: true }
        : { pageSize: 200, ignoreYearFilter: true };
      
      const res = await getWorkOrderList(params);
      // console.log('Search results:', res.items?.length);
      workOrderList.value = res.items || [];
    } catch (error) {
      console.error('Failed to search work orders', error);
    }
  }

  return {
    deptTreeData,
    deptRawData,
    workOrderList,
    supplierList,
    isLoading,
    loadInitialData,
    searchWorkOrders,
  };
}
