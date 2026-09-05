export interface ShadowCalculationContext {
  asOf: Date;
  scope: Record<string, unknown>;
}

export interface ShadowCalculationSnapshot {
  metricCode: string;
  calculatedAt: string;
  registryDefinition: string;
  currentCalculation: unknown;
  shadowCalculation: unknown;
  difference: ShadowDifference;
}

export interface ShadowDifference {
  equal: boolean;
  fields: Array<{ current: unknown; field: string; shadow: unknown }>;
}

export interface MetricCalculationAdapter {
  metricCode: string;
  registryDefinition: string;
  sourceQuery: string;
  calculateCurrent: (context: ShadowCalculationContext) => Promise<unknown>;
  calculateShadow: (context: ShadowCalculationContext) => Promise<unknown>;
}

export const CANONICAL_SHADOW_METRICS = [
  'BM-FIRST-PASS-YIELD',
  'BM-FINAL-PASS-RATE',
  'BM-GROSS-QUALITY-LOSS',
  'BM-NET-QUALITY-LOSS',
  'BM-PROBLEM-CLOSURE-RATE',
] as const;

function diffValues(
  current: unknown,
  shadow: unknown,
  prefix = '',
): ShadowDifference['fields'] {
  if (Object.is(current, shadow)) return [];
  if (
    typeof current !== 'object' ||
    current === null ||
    typeof shadow !== 'object' ||
    shadow === null
  )
    return [{ field: prefix || '$', current, shadow }];
  const keys = new Set([...Object.keys(current), ...Object.keys(shadow)]);
  return [...keys].flatMap((key) =>
    diffValues(
      (current as Record<string, unknown>)[key],
      (shadow as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

export async function calculateShadowMetric(
  adapter: MetricCalculationAdapter,
  context: ShadowCalculationContext,
  calculateShadow = adapter.calculateShadow,
): Promise<ShadowCalculationSnapshot> {
  const [currentCalculation, shadowCalculation] = await Promise.all([
    adapter.calculateCurrent(context),
    calculateShadow(context),
  ]);
  const fields = diffValues(currentCalculation, shadowCalculation);
  return {
    metricCode: adapter.metricCode,
    calculatedAt: new Date().toISOString(),
    registryDefinition: adapter.registryDefinition,
    currentCalculation,
    shadowCalculation,
    difference: { equal: fields.length === 0, fields },
  };
}

export function assertShadowValidationEvidence(
  evidence: null | string | undefined,
): void {
  if (!evidence?.trim()) throw new Error('SHADOW_VALIDATION_EVIDENCE_REQUIRED');
}
