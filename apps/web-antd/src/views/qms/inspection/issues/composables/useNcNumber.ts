import type { Ref } from 'vue';
import type { IssueFormState } from '../types';

import { ref, watch } from 'vue';

import { getInspectionIssues } from '#/api/qms/inspection';

import { NC_NUMBER_PREFIX, NC_NUMBER_SUFFIX, NC_NUMBER_SEQUENCE_LENGTH } from '../constants';

interface UseNcNumberOptions {
  formState: Ref<IssueFormState>;
  isEditMode: Ref<boolean>;
}

/**
 * NC 编号生成 Composable
 */
export function useNcNumber(options: UseNcNumberOptions) {
  const { formState, isEditMode } = options;

  const isAutoNc = ref(false);

  /**
   * 生成 NC 编号
   */
  async function generateNcNumber(): Promise<string> {
    const now = new Date();
    const yearShort = now.getFullYear().toString().slice(-2);
    const prefix = `${NC_NUMBER_PREFIX}-${yearShort}${NC_NUMBER_SUFFIX}-`;

    try {
      const items = await getInspectionIssues();
      const yearItems = items.filter(
        (item) => item.ncNumber && item.ncNumber.startsWith(prefix),
      );

      let maxSeq = 0;
      yearItems.forEach((item) => {
        const parts = item.ncNumber.split('-');
        if (parts.length > 2) {
          const seq = Number.parseInt(parts[parts.length - 1] as string, 10);
          if (!Number.isNaN(seq) && seq > maxSeq) {
            maxSeq = seq;
          }
        }
      });

      const nextSeq = (maxSeq + 1).toString().padStart(NC_NUMBER_SEQUENCE_LENGTH, '0');
      return `${prefix}${nextSeq}`;
    } catch (error) {
      console.error('Failed to generate NC sequence', error);
      return `${prefix}${'0'.repeat(NC_NUMBER_SEQUENCE_LENGTH - 1)}1`;
    }
  }

  // 监听自动生成开关
  watch(isAutoNc, async (val) => {
    if (val && !isEditMode.value) {
      formState.value.ncNumber = await generateNcNumber();
    }
  });

  /**
   * 重置自动生成状态
   */
  function resetAutoNc() {
    isAutoNc.value = false;
  }

  return {
    isAutoNc,
    generateNcNumber,
    resetAutoNc,
  };
}
