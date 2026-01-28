import type { QualityLossItem } from '@qgs/shared';

import type { Ref } from 'vue';

import { computed } from 'vue';

import { QualityLossStatusEnum } from '#/api/qms/enums';

/**
 * 质量损失统计逻辑 Hooks
 */
export function useLossStatistics(allLossData: Ref<QualityLossItem[]>) {
  const stats = computed(() => {
    const data = allLossData.value;

    // 总损失金额
    const totalAmount = data.reduce(
      (acc, item) => acc + (Number(item.amount) || 0),
      0,
    );

    // 总索赔回收额
    const totalClaim = data.reduce(
      (acc, item) => acc + (Number(item.actualClaim) || 0),
      0,
    );

    // 挽回率 (百分比字符串)
    const recoveryRate =
      totalAmount > 0 ? ((totalClaim / totalAmount) * 100).toFixed(1) : '0';

    // 待处理损失额 (Pending 或 Processing 状态)
    const pendingAmount = data
      .filter(
        (item) =>
          item.status === QualityLossStatusEnum.PENDING ||
          item.status === QualityLossStatusEnum.PROCESSING,
      )
      .reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

    return {
      totalAmount,
      totalClaim,
      recoveryRate,
      pendingAmount,
    };
  });

  return { stats };
}
