import type { Ref } from 'vue';

import type { InspectionIssue, IssueFormState } from '../types';

import { watch } from 'vue';

import { useI18n } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createInspectionIssue,
  updateInspectionIssue,
} from '#/api/qms/inspection';
import { useErrorHandler } from '#/hooks/useErrorHandler';

import { DEFAULT_VALUES } from '../constants';

type FormApi = ReturnType<typeof useVbenForm>[1];
type UploadPhotoItem = {
  response?: { data?: { url?: string } };
  status?: string;
  url?: string;
};
type IssueSubmitValues = Omit<Partial<InspectionIssue>, 'photos'> & {
  id?: string;
  photos?: UploadPhotoItem[];
};

/**
 * 创建初始数据
 */
export function createInitialData(inspector = ''): Partial<IssueFormState> {
  return {
    ncNumber: '', // Explicitly reset NC number for new issues
    reportDate: new Date().toISOString().split('T')[0],
    status: DEFAULT_VALUES.DEFAULT_STATUS,
    quantity: DEFAULT_VALUES.DEFAULT_QUANTITY,
    lossAmount: 0,
    inspector,
    claim: DEFAULT_VALUES.DEFAULT_CLAIM,
    photos: [],
    defectType: DEFAULT_VALUES.DEFAULT_DEFECT_TYPE,
    defectSubtype: DEFAULT_VALUES.DEFAULT_DEFECT_SUBTYPE,
    severity: DEFAULT_VALUES.DEFAULT_SEVERITY,
  };
}

interface UseIssueFormOptions {
  formApi: FormApi;
  initialData?: Ref<Partial<InspectionIssue> | undefined>;
  isEditMode: Ref<boolean>;
  open: Ref<boolean>;
  onSuccess: () => void;
  onClose: () => void;
}

/**
 * 问题表单 composable (Refactored for Vben Form)
 */
export function useIssueForm(options: UseIssueFormOptions) {
  const { formApi, initialData, isEditMode, open, onSuccess, onClose } =
    options;
  const { t } = useI18n();
  const { handleApiError } = useErrorHandler();
  const userStore = useUserStore();

  /**
   * 重置表单
   */
  async function resetForm() {
    await formApi.resetForm();
    const defaultInspector =
      userStore.userInfo?.realName || userStore.userInfo?.username || '';
    await formApi.setValues(createInitialData(defaultInspector));
  }

  /**
   * 从数据初始化表单
   */
  async function initFromData(data: Partial<InspectionIssue>) {
    const { photos, ...rest } = data;

    let photoArray: string[] = [];
    if (Array.isArray(photos)) {
      photoArray = photos;
    } else if (photos) {
      photoArray = [photos as unknown as string];
    }

    const values: Record<string, unknown> = {
      ...rest,
      photos: photoArray.map((url, index) => ({
        uid: String(index),
        name: `Photo ${index + 1}`,
        status: 'done' as const,
        url,
      })),
    };
    await formApi.setValues(values);
  }

  /**
   * 提交表单
   */
  async function submit() {
    try {
      const { valid } = await formApi.validate();
      if (!valid) return;

      const rawData = (await formApi.getValues()) as IssueSubmitValues;

      // Transform photos to string[] (urls)
      const photos =
        rawData.photos
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
      handleApiError(error, 'Save Inspection Issue');
      const errorMessage =
        error instanceof Error ? error.message : t('common.saveFailed');
      message.error(errorMessage);
    }
  }

  // 监听弹窗打开，初始化表单
  watch(open, async (val) => {
    if (val) {
      await (isEditMode.value && initialData?.value
        ? initFromData(initialData.value)
        : resetForm());
    }
  });

  return {
    resetForm,
    initFromData,
    submit,
  };
}
