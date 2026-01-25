import type { Ref } from 'vue';

import type { AfterSalesItem, WorkOrderItem } from '@qgs/shared';
import type { TreeSelectNode } from '#/types';

import { reactive, ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import { createAfterSales, updateAfterSales } from '#/api/qms/after-sales';

import {
  createInitialFormState,
  DEFECT_SUBTYPES,
  PRODUCT_SUBTYPES,
} from '../constants';

export type AfterSalesFormState = Partial<AfterSalesItem>;

interface UseAfterSalesFormOptions {
  open: Ref<boolean>;
  isEditMode: Ref<boolean>;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * 售后表单 composable
 */
export function useAfterSalesForm(options: UseAfterSalesFormOptions) {
  const { open, isEditMode, onSuccess, onClose } = options;

  const formState = reactive<AfterSalesFormState>({});
  const currentId = ref<null | string>(null);

  // 产品子类型
  const currentProductSubtypes = ref<string[]>([]);
  // 缺陷子类型
  const currentDefectSubtypes = ref<string[]>([]);

  /**
   * 更新产品子类型选项
   */
  function updateProductSubtypes() {
    currentProductSubtypes.value =
      formState.productType && PRODUCT_SUBTYPES[formState.productType]
        ? PRODUCT_SUBTYPES[formState.productType] || []
        : [];
  }

  /**
   * 产品类型变更处理
   */
  function handleProductTypeChange() {
    formState.productSubtype = '';
    updateProductSubtypes();
  }

  /**
   * 更新缺陷子类型选项
   */
  function updateDefectSubtypes() {
    currentDefectSubtypes.value =
      formState.defectType && DEFECT_SUBTYPES[formState.defectType]
        ? DEFECT_SUBTYPES[formState.defectType] || []
        : [];
  }

  /**
   * 缺陷类型变更处理
   */
  function handleDefectTypeChange() {
    formState.defectSubtype = '';
    updateDefectSubtypes();
  }

  /**
   * 工单变更处理
   */
  function handleWorkOrderChange(
    val: number | string,
    workOrderList: WorkOrderItem[],
  ) {
    const wo = workOrderList.find((item) => item.workOrderNumber === val);
    if (wo) {
      formState.projectName = wo.projectName || '';
      formState.customerName = wo.customerName || '';
      formState.division = wo.division || '';
    }
  }

  /**
   * 重置表单
   */
  function resetForm() {
    // 使用 Object.assign 直接覆盖，而不是逐个 delete
    const initialState = createInitialFormState();
    // 清除旧属性
    for (const key in formState) {
      if (Object.prototype.hasOwnProperty.call(formState, key)) {
        (formState as any)[key] = undefined;
      }
    }
    Object.assign(formState, initialState);
    currentId.value = null;
    updateDefectSubtypes();
    updateProductSubtypes();
  }

  /**
   * 从数据初始化表单
   */
  function initFromData(row: AfterSalesItem) {
    // 同理，清理后赋值
    for (const key in formState) {
      if (Object.prototype.hasOwnProperty.call(formState, key)) {
        (formState as any)[key] = undefined;
      }
    }
    Object.assign(formState, row);
    currentId.value = row.id;
    updateDefectSubtypes();
    updateProductSubtypes();
  }

  /**
   * 提交表单
   */
  async function submit() {
    try {
      if (isEditMode.value && currentId.value) {
        await updateAfterSales(currentId.value, formState);
        message.success('保存成功');
      } else {
        await createAfterSales(formState);
        message.success('登记成功');
      }
      onClose();
      onSuccess();
    } catch {
      message.error(isEditMode.value ? '保存失败' : '登记失败');
    }
  }

  /**
   * 检查是否为采购部门
   */
  function checkIsPurchasingDept(deptTreeData: TreeSelectNode[]): boolean {
    if (!formState.responsibleDept) return false;
    if (String(formState.responsibleDept).includes('采购')) return true;

    const findDept = (nodes: TreeSelectNode[]): boolean => {
      for (const node of nodes) {
        if (node.value === formState.responsibleDept) {
          return (
            (node.title as string)?.includes('采购') ||
            ((node as any).label as string)?.includes('采购')
          );
        }
        if (node.children && findDept(node.children)) return true;
      }
      return false;
    };
    return findDept(deptTreeData);
  }

  // 监听弹窗打开
  watch(open, (val) => {
    if (val && !isEditMode.value) {
      resetForm();
    }
  });

  return {
    formState,
    currentId,
    currentProductSubtypes,
    currentDefectSubtypes,
    resetForm,
    initFromData,
    submit,
    handleProductTypeChange,
    handleDefectTypeChange,
    handleWorkOrderChange,
    checkIsPurchasingDept,
  };
}
