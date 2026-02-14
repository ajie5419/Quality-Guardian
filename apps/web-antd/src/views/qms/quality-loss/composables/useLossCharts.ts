import type { QualityLossItem } from '@qgs/shared';

import type { Ref } from 'vue';

import type { DeptNode } from '../types';

import { computed, ref } from 'vue';

import { findNameById } from '#/types';

/**
 * 质量损失图表配置 Hooks
 */
export function useLossCharts(
  allLossData: Ref<QualityLossItem[]>,
  deptRawData: Ref<DeptNode[]>,
) {
  // 获取可用的年份列表
  const availableYears = computed(() => {
    const years = new Set<number>();
    allLossData.value.forEach((item) => {
      if (item.date) {
        years.add(new Date(item.date).getFullYear());
      }
    });

    const yearList = [...years].sort((a, b) => b - a);
    if (yearList.length === 0) {
      yearList.push(new Date().getFullYear());
    }
    return yearList;
  });

  // 当前选中的年份
  const selectedYear = ref<number>(new Date().getFullYear());

  /**
   * 生成责任部门分布饼图配置
   */
  function getDeptDistributionOption(): Record<string, unknown> {
    // 🌟 关键修复：只过滤选中年份的数据
    const data = allLossData.value.filter((item) => {
      if (!item.date) return false;
      return new Date(item.date).getFullYear() === selectedYear.value;
    });

    const deptMap: Record<string, number> = {};

    data.forEach((item) => {
      const rawDept = item.responsibleDepartment || '未指定部门';
      const label = findNameById(deptRawData.value, rawDept) || rawDept;
      deptMap[label] = (deptMap[label] || 0) + (Number(item.amount) || 0);
    });

    return {
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { bottom: '0', icon: 'circle', type: 'scroll' },
      series: [
        {
          name: '损失金额',
          type: 'pie',
          radius: ['45%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: '16', fontWeight: 'bold' },
          },
          data: Object.entries(deptMap).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    };
  }

  /**
   * 生成月度趋势图配置
   */
  function getTrendOption(): Record<string, unknown> {
    const monthNames = [
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];
    const lossTrend: number[] = Array.from({ length: 12 }).fill(0) as number[];
    const claimTrend: number[] = Array.from({ length: 12 }).fill(0) as number[];

    allLossData.value.forEach((item) => {
      if (!item.date) return;
      const date = new Date(item.date);
      // 🌟 关键修复：只统计选中年份的数据
      if (date.getFullYear() !== selectedYear.value) return;

      const month = date.getMonth();
      if (month < 0 || month >= 12) return;

      lossTrend[month] = (lossTrend[month] || 0) + (Number(item.amount) || 0);
      claimTrend[month] =
        (claimTrend[month] || 0) + (Number(item.actualClaim) || 0);
    });

    return {
      title: {
        text: `${selectedYear.value}年度 损益趋势`,
        left: 'center',
        top: 0,
        textStyle: { fontSize: 13, color: '#666', fontWeight: 'normal' },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['预计损失', '实际索赔'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: monthNames,
        axisLine: { lineStyle: { color: '#eee' } },
        axisLabel: { color: '#999' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { type: 'dashed' as const, color: '#f5f5f5' } },
      },
      series: [
        {
          name: '预计损失',
          type: 'line',
          smooth: true,
          areaStyle: { color: 'rgba(24,144,255,0.1)' },
          data: lossTrend,
          color: '#1890ff',
        },
        {
          name: '实际索赔',
          type: 'line',
          smooth: true,
          data: claimTrend,
          color: '#52c41a',
        },
      ],
    };
  }

  return {
    getDeptDistributionOption,
    getTrendOption,
    availableYears,
    selectedYear,
  };
}
