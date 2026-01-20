import type { DeptNode, WorkOrderItem, SupplierItem } from '../types';

import { ref } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { getDeptList } from '#/api/system/dept';
import { getWorkOrderList } from '#/api/qms/work-order';
import { getSupplierList } from '#/api/qms/supplier';
import { convertToTreeSelectData } from '#/types';

import { UI_CONSTANTS } from '../constants';

/**
 * 质量问题数据加载 Composable
 */
export function useIssueData() {
  const { t } = useI18n();

  const deptTreeData = ref<DeptNode[]>([]);
  const deptRawData = ref<DeptNode[]>([]);
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
        getWorkOrderList(),
        getSupplierList({ pageSize: UI_CONSTANTS.SUPPLIER_PAGE_SIZE }),
      ]);

      deptRawData.value = deptRes as DeptNode[];
      deptTreeData.value = convertToTreeSelectData(deptRes);
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

  return {
    deptTreeData,
    deptRawData,
    workOrderList,
    supplierList,
    isLoading,
    loadInitialData,
  };
}
