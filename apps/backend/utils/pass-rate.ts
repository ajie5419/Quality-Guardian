import { getTargetPassRate as getTargetPassRateByStd } from '~/constants/quality-standards';
import prisma from '~/utils/prisma';

interface DrillDownItem {
  category: string;
  passCount: number;
  passRate: number;
  process: string;
  targetPassRate: number;
  totalCount: number;
}

const DEFAULT_PASS_RATE_TARGETS: Record<string, number> = {
  原材料: 99.8,
  辅材: 99.9,
  外购件: 99.8,
  机加件: 99.9,
  下料: 99.9,
  组对: 99.85,
  焊接: 99.85,
  机加: 99.9,
  涂装: 99.85,
  组装: 99.85,
  装配: 99.85,
  外协: 99.85,
  成品检验: 99.85,
  设计: 99.85,
};

const GLOBAL_DEFAULT_TARGET = 99.85;

const PROCESS_MAPPING: Record<string, string> = {
  设计: '设计',
  组对: '组焊',
  焊接: '组焊',
  焊后尺寸: '组焊',
  组装: '组装',
  装配: '组装',
  组拼: '组装',
  打砂: '涂装',
  喷漆: '涂装',
  下料: '下料',
  机加: '机加',
  外观: '',
  整体拼装: '',
};

export async function createPassRateTargetResolver() {
  const setting = await prisma.system_settings.findUnique({
    where: { key: 'QMS_PASS_RATE_TARGETS' },
  });

  let targets = { ...DEFAULT_PASS_RATE_TARGETS };
  if (setting?.value) {
    try {
      const saved = JSON.parse(setting.value);
      targets = { ...targets, ...saved };
    } catch {
      // 忽略脏配置，回退默认目标值
    }
  }

  return (processName?: string): number => {
    if (!processName) return GLOBAL_DEFAULT_TARGET;
    return targets[processName] ?? getTargetPassRateByStd(processName);
  };
}

export async function getPassRateDrillDownByRange(
  start: Date,
  end: Date,
  getTargetPassRate: (name?: string) => number,
): Promise<DrillDownItem[]> {
  const drillDown: DrillDownItem[] = [];
  const inspections = await prisma.inspections.findMany({
    where: { isDeleted: false, inspectionDate: { gte: start, lte: end } },
  });

  const ncrRecords = await prisma.quality_records.findMany({
    where: { isDeleted: false, date: { gte: start, lte: end } },
    select: { processName: true, quantity: true },
  });

  const ncrDefectsMap: Record<string, number> = {};
  ncrRecords.forEach((rec) => {
    const rawProc = rec.processName || '其他';
    const proc = PROCESS_MAPPING[rawProc] || rawProc;
    ncrDefectsMap[proc] = (ncrDefectsMap[proc] || 0) + (rec.quantity || 0);
  });

  const incomingTypes = [
    ...new Set(
      inspections
        .filter((i) => i.category === 'INCOMING')
        .map((i) => (i.incomingType || '未分类') as string),
    ),
  ];

  for (const type of incomingTypes) {
    const items = inspections.filter(
      (i) => i.category === 'INCOMING' && (i.incomingType || '未分类') === type,
    );
    const total = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
    let passed = items
      .filter((i) => i.result === 'PASS')
      .reduce((sum, i) => sum + (i.quantity || 1), 0);

    const ncrQty = ncrDefectsMap[String(type)] || 0;
    passed = Math.max(0, passed - ncrQty);

    drillDown.push({
      process: String(type),
      category: '来料检验',
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(1)) : 0,
      targetPassRate: getTargetPassRate(String(type)),
      totalCount: total,
      passCount: passed,
    });
  }

  const processItems = inspections.filter((i) => i.category === 'PROCESS');
  const processStats: Record<string, { passed: number; total: number }> = {};

  const designName = PROCESS_MAPPING['设计'] || '设计';
  if (ncrDefectsMap[designName]) {
    processStats[designName] = { total: 0, passed: 0 };
  }

  for (const item of processItems) {
    const rawProcess = item.processName || '';
    const mappedName = PROCESS_MAPPING[rawProcess];

    if (!mappedName) continue;

    if (!processStats[mappedName]) {
      processStats[mappedName] = { total: 0, passed: 0 };
    }

    const qty = item.quantity || 1;
    processStats[mappedName].total += qty;
    if (item.result === 'PASS') {
      processStats[mappedName].passed += qty;
    }
  }

  for (const [name, stats] of Object.entries(processStats)) {
    const { total, passed: rawPassed } = stats;
    const ncrQty = ncrDefectsMap[name] || 0;
    const passed = Math.max(0, rawPassed - ncrQty);
    const effectiveTotal = Math.max(total, ncrQty);

    drillDown.push({
      process: name,
      category: '过程检验',
      passRate:
        effectiveTotal > 0
          ? Number(((passed / effectiveTotal) * 100).toFixed(1))
          : 0,
      targetPassRate: getTargetPassRate(name),
      totalCount: effectiveTotal,
      passCount: passed,
    });
  }

  const finals = inspections.filter((i) => i.category === 'SHIPMENT');
  if (finals.length > 0 || ncrDefectsMap['成品检验']) {
    const total = finals.reduce((sum, i) => sum + (i.quantity || 1), 0);
    let passed = finals
      .filter((i) => i.result === 'PASS')
      .reduce((sum, i) => sum + (i.quantity || 1), 0);

    const ncrQty = ncrDefectsMap['成品检验'] || 0;
    passed = Math.max(0, passed - ncrQty);

    const effectiveTotal = Math.max(total, ncrQty);

    drillDown.push({
      process: '成品检验',
      category: '成品检验',
      passRate:
        effectiveTotal > 0
          ? Number(((passed / effectiveTotal) * 100).toFixed(1))
          : 0,
      targetPassRate: getTargetPassRate('成品检验'),
      totalCount: effectiveTotal,
      passCount: passed,
    });
  }

  return drillDown;
}
