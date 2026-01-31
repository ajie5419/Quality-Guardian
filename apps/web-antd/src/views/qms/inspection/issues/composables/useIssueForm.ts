import type { Ref } from 'vue';

import type { InspectionIssue, IssueFormState } from '../types';

import { ref, watch } from 'vue';

import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import {
  createInspectionIssue,
  updateInspectionIssue,
} from '#/api/qms/inspection';

import { DEFAULT_VALUES } from '../constants';

/**
 * 创建初始表单状态
 */
export function createInitialFormState(inspector = ''): IssueFormState {
  return {
    ncNumber: '',
    reportDate: new Date().toISOString().split('T')[0],
    workOrderNumber: '',
    status: DEFAULT_VALUES.DEFAULT_STATUS,
    projectName: '',
    partName: '',
    description: '',
    quantity: DEFAULT_VALUES.DEFAULT_QUANTITY,
    rootCause: '',
    solution: '',
    lossAmount: 0,
    responsibleDepartment: '',
    supplierName: '',
    inspector,
    claim: DEFAULT_VALUES.DEFAULT_CLAIM,
    photos: [],
    division: '',
    defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
    defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
    divisionId: undefined,
    responsibleDepartmentId: undefined,
  };
}

interface UseIssueFormOptions {
  initialData?: Ref<Partial<InspectionIssue> | undefined>;
  isEditMode: Ref<boolean>;
  open: Ref<boolean>;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * 问题表单 composable
 */
export function useIssueForm(options: UseIssueFormOptions) {
  const { initialData, isEditMode, open, onSuccess, onClose } = options;
  const { t } = useI18n();
  const userStore = useUserStore();

  const formState = ref<IssueFormState>(
    createInitialFormState(
      userStore.userInfo?.realName || userStore.userInfo?.username || '',
    ),
  );

  /**
   * 重置表单
   */
  function resetForm() {
    formState.value = createInitialFormState(
      userStore.userInfo?.realName || userStore.userInfo?.username || '',
    );
  }

  /**
   * 从数据初始化表单
   */
  function initFromData(data: Partial<InspectionIssue>) {
    const { photos, ...rest } = data;

    // 修复嵌套三元运算符以满足 unicorn/no-nested-ternary 和 prettier 格式
    let photoArray: string[] = [];
    if (Array.isArray(photos)) {
      photoArray = photos;
    } else if (photos) {
      photoArray = [photos as unknown as string];
    }

    formState.value = {
      ...(rest as IssueFormState),
      photos: photoArray.map((url, index) => ({
        uid: String(index),
        name: `Photo ${index + 1}`,
        status: 'done' as const,
        url,
      })),
    };
  }

  /**
   * 提交表单
   */
  async function submit() {
    try {
      const rawData = { ...formState.value };

      // Transform photos to string[] (urls)
      const photos =
        (rawData.photos as any[])
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
        severity: rawData.severity || DEFAULT_VALUES.DEFAULT_SEVERITY,
      };

      if (isEditMode.value && data.id) {
        await updateInspectionIssue(data.id, data as InspectionIssue);
        message.success(t('common.saveSuccess'));
      } else {
        await createInspectionIssue(data as InspectionIssue);
        message.success(t('common.createSuccess'));
      }

      onClose();
      onSuccess();
    } catch (error) {
      console.error('Submit error:', error);
      const errorMessage =
        error instanceof Error ? error.message : t('common.saveFailed');
      message.error(errorMessage);
      throw error;
    }
  }

  /**
   * 验证并提交
   */
  function validateAndSubmit() {
    if (!formState.value.workOrderNumber) {
      message.error(t('qms.inspection.issues.selectWorkOrder'));
      return;
    }
    submit();
  }

  // 监听弹窗打开，初始化表单
  watch(open, (val) => {
    if (val) {
      if (isEditMode.value && initialData?.value) {
        initFromData(initialData.value);
      } else {
        resetForm();
      }
    }
  });

  return {
    formState,
    resetForm,
    initFromData,
    submit,
    validateAndSubmit,
  };
}
