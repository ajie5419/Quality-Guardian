import type { AfterSalesItem, WorkOrderItem } from '@qgs/shared';

import type { Ref } from 'vue';

import type { AfterSalesFormState, TreeSelectNode } from '#/types';

import { computed, reactive, ref, watch } from 'vue';

import { useI18n } from '@vben/locales';

import { message } from 'ant-design-vue';

import { createAfterSales, updateAfterSales } from '#/api/qms/after-sales';

import {
  createInitialFormState,
  DEFECT_SUBTYPES,
  PRODUCT_SUBTYPES,
} from '../constants';

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
  const { t } = useI18n();

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
    workOrderListOrItem?: WorkOrderItem | WorkOrderItem[],
  ) {
    const wo = Array.isArray(workOrderListOrItem)
      ? workOrderListOrItem.find((item) => item.workOrderNumber === val)
      : workOrderListOrItem;

    if (wo) {
      formState.projectName = wo.projectName || '';
      formState.customerName = wo.customerName || '';
      formState.division = wo.division || '';
    }
  }

  /**
   * 重置表单
   */
  /**
   * 重置表单
   */
  function resetForm() {
    // 使用 Object.assign 直接覆盖，而不是逐个 delete
    const initialState = createInitialFormState();
    // 清除旧属性
    (Object.keys(formState) as Array<keyof AfterSalesFormState>).forEach(
      (key) => {
        formState[key] = undefined;
      },
    );
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
    (Object.keys(formState) as Array<keyof AfterSalesFormState>).forEach(
      (key) => {
        formState[key] = undefined;
      },
    );

    const { photos, ...rest } = row;

    // 处理照片数据转换
    let photoArray: string[] = [];
    if (Array.isArray(photos)) {
      photoArray = photos;
    } else if (photos) {
      photoArray = [photos as unknown as string];
    }

    Object.assign(formState, {
      ...rest,
      photos: photoArray.map((url, index) => ({
        uid: String(index),
        name: `Photo ${index + 1}`,
        status: 'done' as const,
        url,
      })),
    });

    currentId.value = row.id;
    updateDefectSubtypes();
    updateProductSubtypes();
  }

  /**
   * 提交表单
   */
  async function submit() {
    try {
      const rawData = { ...formState };

      // 将照片转换回 URL 数组
      const photos =
        ((rawData.photos || []) as PhotoCandidate[])
          ?.map((f) => {
            if (f.url) return f.url;
            if (f.status === 'done' && f.response?.data?.url) {
              return f.response.data.url;
            }
            return null;
          })
          .filter((url): url is string => !!url) || [];

      const data = {
        ...rawData,
        photos,
      };

      if (isEditMode.value && currentId.value) {
        await updateAfterSales(currentId.value, data);
        message.success(t('common.saveSuccess'));
      } else {
        await createAfterSales(data);
        message.success(t('common.createSuccess'));
      }
      onClose();
      onSuccess();
    } catch {
      message.error(
        isEditMode.value ? t('common.saveFailed') : t('common.createFailed'),
      );
    }
  }

  /**
   * 检查是否为采购部门
   */
  function checkIsPurchasingDept(deptTreeData: TreeSelectNode[]): boolean {
    if (!formState.responsibleDept) return false;
    const KEYWORD = '采购';
    if (String(formState.responsibleDept).includes(KEYWORD)) return true;

    const findDept = (nodes: TreeSelectNode[]): boolean => {
      for (const node of nodes) {
        if (node.value === formState.responsibleDept) {
          return (
            (node.title as string)?.includes(KEYWORD) ||
            (node.label as string)?.includes(KEYWORD)
          );
        }
        if (node.children && findDept(node.children)) return true;
      }
      return false;
    };
    return findDept(deptTreeData);
  }

  // 表单校验规则
  const rules = computed(() => ({
    workOrderNumber: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.workOrderNumber'),
        ]),
      },
    ],
    customerName: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.afterSales.form.customerName'),
        ]),
      },
    ],
    partName: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.afterSales.form.partName'),
        ]),
      },
    ],
    issueDate: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.issueDate'),
        ]),
      },
    ],
    location: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.afterSales.form.location'),
        ]),
      },
    ],
    severity: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.severity'),
        ]),
      },
    ],
    defectType: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.defectType'),
        ]),
      },
    ],
    quantity: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.afterSales.form.quantity'),
        ]),
      },
    ],
    responsibleDept: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.responsibleDept'),
        ]),
      },
    ],
    status: [
      {
        required: true,
        message: t('ui.formRules.selectRequired', [
          t('qms.afterSales.form.status'),
        ]),
      },
    ],
    issueDescription: [
      {
        required: true,
        message: t('ui.formRules.required', [
          t('qms.afterSales.form.issueDescription'),
        ]),
      },
    ],
  }));

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
    rules,
    resetForm,
    initFromData,
    submit,
    handleProductTypeChange,
    handleDefectTypeChange,
    handleWorkOrderChange,
    checkIsPurchasingDept,
  };
}
type PhotoCandidate = {
  response?: { data?: { url?: string } };
  status?: string;
  url?: string;
};
