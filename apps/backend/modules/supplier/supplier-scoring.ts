import {
  IN_HOUSE_OUTSOURCING_MODE,
  isOutsourcingCategory,
  normalizeOutsourcingMode,
} from '~/utils/supplier';

const THRESHOLD_CLASS_A_AMOUNT = 5000;
const THRESHOLD_CRITICAL_AMOUNT = 80_000;
const THRESHOLD_SCORE_WARNING = 75;
const THRESHOLD_INCOMING_YIELD_WARNING = 90;
const LIMIT_CONSECUTIVE_FAILURE = 3;
const LIMIT_MIN_ISSUE_COUNT_FOR_STRICT_ACTION = 3;
const OPEN_IN_HOUSE_ISSUE_WARNING_LIMIT = 3;

export interface SupplierStats {
  afterSalesClassA: number;
  afterSalesClassB: number;
  afterSalesClassC: number;
  afterSalesCount: number;
  afterSalesLoss: number;
  consecutiveBigFailures: number;
  count: number;
  engineeringClassA: number;
  engineeringClassB: number;
  engineeringClassC: number;
  engineeringCount: number;
  engineeringDefectQuantity: number;
  engineeringLoss: number;
  failures: number;
  failuresQuantity: number;
  maxSingleLoss: number;
  openAfterSalesCount: number;
  openEngineeringCount: number;
  qualifiedCount: number;
  quantity: number;
}

export function createEmptyStats(): SupplierStats {
  return {
    afterSalesClassA: 0,
    afterSalesClassB: 0,
    afterSalesClassC: 0,
    afterSalesCount: 0,
    afterSalesLoss: 0,
    consecutiveBigFailures: 0,
    count: 0,
    engineeringClassA: 0,
    engineeringClassB: 0,
    engineeringClassC: 0,
    engineeringCount: 0,
    engineeringDefectQuantity: 0,
    engineeringLoss: 0,
    failures: 0,
    failuresQuantity: 0,
    maxSingleLoss: 0,
    openAfterSalesCount: 0,
    openEngineeringCount: 0,
    qualifiedCount: 0,
    quantity: 0,
  };
}

function clamp100(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function classifyDefect(
  loss: number,
  severity?: string,
): 'A' | 'B' | 'C' | null {
  const sev = (severity || '').toLowerCase();
  if (loss > THRESHOLD_CLASS_A_AMOUNT) return 'A';
  if (['critical', 'fatal', 'p0', 'p1', '致命'].includes(sev)) return 'A';
  if (['high', 'major', 'p2'].includes(sev)) return 'B';
  if (['low', 'minor', 'p3'].includes(sev)) return 'C';
  return null;
}

export function calculateConsecutiveFailures(
  records: Array<{ type: 'A' | 'B' | 'C' | null }>,
) {
  let consecutiveCount = 0;
  let maxConsecutive = 0;
  for (const record of records) {
    if (record.type === 'A' || record.type === 'B') consecutiveCount++;
    else consecutiveCount = 0;
    if (consecutiveCount > maxConsecutive) maxConsecutive = consecutiveCount;
  }
  return maxConsecutive;
}

export function buildSupplierScore(input: {
  incomingQualifiedRate: number;
  stat: SupplierStats;
  totalIssueCount: number;
}) {
  const { incomingQualifiedRate, stat, totalIssueCount } = input;
  const engineeringDeduction =
    stat.engineeringClassA * 15 +
    stat.engineeringClassB * 5 +
    stat.engineeringClassC * 1;
  const afterSalesDeduction =
    stat.afterSalesClassA * 15 +
    stat.afterSalesClassB * 5 +
    stat.afterSalesClassC * 1;
  const incomingDeduction = stat.failures * 3;
  const totalDeduction =
    engineeringDeduction + afterSalesDeduction + incomingDeduction;

  return {
    afterSalesScore: clamp100(100 - afterSalesDeduction),
    engineeringScore: clamp100(100 - engineeringDeduction),
    incomingScore: clamp100(100 - incomingDeduction),
    score: Math.round(clamp100(100 - totalDeduction)),
    shouldDowngradeToC:
      stat.engineeringClassA + stat.afterSalesClassA >= 2 ||
      stat.engineeringClassB + stat.afterSalesClassB >= 3 ||
      (stat.count > 5 &&
        incomingQualifiedRate < THRESHOLD_INCOMING_YIELD_WARNING),
    shouldFreeze:
      totalIssueCount >= LIMIT_MIN_ISSUE_COUNT_FOR_STRICT_ACTION &&
      (stat.consecutiveBigFailures >= LIMIT_CONSECUTIVE_FAILURE ||
        stat.maxSingleLoss > THRESHOLD_CRITICAL_AMOUNT),
    stabilityScore: 100,
  };
}

export function buildInHouseOutsourcingScore(input: {
  stat: SupplierStats;
  totalIssueCount: number;
}) {
  const { stat, totalIssueCount } = input;
  const openIssueCount = stat.openEngineeringCount + stat.openAfterSalesCount;
  const engineeringDeduction =
    stat.engineeringClassA * 12 +
    stat.engineeringClassB * 4 +
    stat.engineeringClassC * 0.5 +
    Math.max(
      0,
      stat.engineeringCount -
        stat.engineeringClassA -
        stat.engineeringClassB -
        stat.engineeringClassC,
    ) *
      0.5;
  const afterSalesDeduction =
    stat.afterSalesClassA * 12 +
    stat.afterSalesClassB * 4 +
    stat.afterSalesClassC * 0.5 +
    Math.max(
      0,
      stat.afterSalesCount -
        stat.afterSalesClassA -
        stat.afterSalesClassB -
        stat.afterSalesClassC,
    ) *
      0.5;
  const openIssueDeduction = openIssueCount * 2;
  const totalDeduction =
    engineeringDeduction + afterSalesDeduction + openIssueDeduction;

  return {
    afterSalesScore: clamp100(100 - afterSalesDeduction),
    engineeringScore: clamp100(100 - engineeringDeduction),
    incomingScore: 100,
    openIssueCount,
    score: Math.round(clamp100(100 - totalDeduction)),
    shouldDowngradeToC:
      stat.engineeringClassA + stat.afterSalesClassA >= 2 ||
      stat.engineeringClassB + stat.afterSalesClassB >= 3 ||
      openIssueCount >= OPEN_IN_HOUSE_ISSUE_WARNING_LIMIT,
    shouldFreeze:
      totalIssueCount >= LIMIT_MIN_ISSUE_COUNT_FOR_STRICT_ACTION &&
      (stat.consecutiveBigFailures >= LIMIT_CONSECUTIVE_FAILURE ||
        stat.maxSingleLoss > THRESHOLD_CRITICAL_AMOUNT),
    stabilityScore: clamp100(100 - openIssueCount * 10),
  };
}

export function applyRecordsToStats(
  stat: SupplierStats,
  records: Array<{
    loss: number;
    origin: 'afterSales' | 'qualityRecords';
    type: 'A' | 'B' | 'C' | null;
  }>,
) {
  const next = { ...stat };
  for (const record of records) {
    if (record.loss > next.maxSingleLoss) next.maxSingleLoss = record.loss;
    if (record.origin === 'qualityRecords') {
      if (record.type === 'A') next.engineeringClassA++;
      if (record.type === 'B') next.engineeringClassB++;
      if (record.type === 'C') next.engineeringClassC++;
    } else {
      if (record.type === 'A') next.afterSalesClassA++;
      if (record.type === 'B') next.afterSalesClassB++;
      if (record.type === 'C') next.afterSalesClassC++;
    }
  }
  next.consecutiveBigFailures = Math.max(
    next.consecutiveBigFailures,
    calculateConsecutiveFailures(records),
  );
  return next;
}

export function scoreSupplierListItem(
  item: Record<string, unknown> & {
    category?: string;
    name?: string;
    outsourcingMode?: string;
    qualityScore?: number;
    status?: string;
  },
  stat: SupplierStats,
) {
  const incomingPassRate =
    stat.count > 0 ? stat.qualifiedCount / stat.count : 1;
  const incomingQualifiedRate = Math.round(incomingPassRate * 100);
  const totalIssueCount = stat.engineeringCount + stat.afterSalesCount;
  const outsourcingMode = normalizeOutsourcingMode(
    item.outsourcingMode,
    item.category,
  );
  const usesInHouseOutsourcingScore =
    isOutsourcingCategory(item.category) &&
    outsourcingMode === IN_HOUSE_OUTSOURCING_MODE;
  const scoring = usesInHouseOutsourcingScore
    ? buildInHouseOutsourcingScore({ stat, totalIssueCount })
    : buildSupplierScore({ incomingQualifiedRate, stat, totalIssueCount });
  let score = scoring.score;
  const warningReasons: string[] = [];
  const manualStatus = String(item.status || 'Qualified');
  let finalStatus = manualStatus || 'Qualified';
  if (finalStatus.toLowerCase() === 'qualified') {
    if (scoring.shouldFreeze) {
      finalStatus = 'Frozen';
      score = 0;
      warningReasons.push('连续重大问题/单次超大损失');
    } else if (scoring.shouldDowngradeToC) {
      finalStatus = 'Observation';
      score = Math.min(score, usesInHouseOutsourcingScore ? 85 : 70);
      warningReasons.push(
        usesInHouseOutsourcingScore
          ? '未关闭/严重问题触发观察'
          : '累计问题触发C级降级',
      );
    } else if (score < THRESHOLD_SCORE_WARNING) {
      finalStatus = 'Observation';
      score = Math.min(score, 75);
      warningReasons.push('综合分过低');
    } else {
      finalStatus = 'Qualified';
    }
  } else {
    if (finalStatus.toLowerCase() === 'frozen') finalStatus = 'Frozen';
    else if (finalStatus.toLowerCase() === 'observation')
      finalStatus = 'Observation';
    else if (finalStatus.toLowerCase() === 'trial') finalStatus = 'Trial';
  }
  let finalRating = 'A';
  if (score >= 90) finalRating = 'A';
  else if (score >= 80) finalRating = 'B';
  else if (score >= 65) finalRating = 'C';
  else finalRating = 'D';
  return {
    ...item,
    afterSalesIssueCount: stat.afterSalesCount,
    afterSalesScore: Math.round(scoring.afterSalesScore),
    engineeringIssueCount: stat.engineeringCount,
    engineeringScore: Math.round(scoring.engineeringScore),
    incomingBatchCount: stat.count,
    incomingQualifiedRate,
    incomingScore: Math.round(scoring.incomingScore),
    incomingTotalQuantity: stat.quantity,
    isWarning: finalStatus === 'Observation' || finalStatus === 'Frozen',
    level: finalRating,
    outsourcingMode,
    qualityScore: score,
    rating: finalRating,
    scoringModel: usesInHouseOutsourcingScore
      ? 'IN_HOUSE_OUTSOURCING'
      : 'SUPPLIER',
    stabilityScore: Math.round(scoring.stabilityScore),
    status: finalStatus,
    totalAfterSalesLoss: stat.afterSalesLoss,
    totalEngineeringLoss: stat.engineeringLoss,
    warningReasons,
  };
}
