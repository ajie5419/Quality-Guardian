import type { AnalyticsAccessContext } from '~/modules/data-scope';

import type { ShadowDiffStatus } from './metric-shadow-adapters';
import type {
  MetricCalculationAdapter,
  ShadowCalculationContext,
} from './metric-shadow-validation';

import process from 'node:process';

import { createModuleLogger } from '~/utils/logger';

import {
  buildShadowEvidence,
  METRIC_CALCULATION_ADAPTERS,
} from './metric-shadow-adapters';
import { checkShadowEnvironment } from './metric-shadow-environment';
import { calculateShadowMetric } from './metric-shadow-validation';

const logger = createModuleLogger('MetricShadowExecution');

export type ShadowScope = 'ALL' | 'DEPT' | 'SELF';

export interface ShadowExecutionWindow {
  end: Date;
  start: Date;
}

export interface ShadowExecutionResult {
  classification: ShadowDiffStatus;
  dataScope: ShadowScope;
  diff: Array<{ current: unknown; field: string; shadow: unknown }>;
  executionWindow: { end: string; start: string };
  issue?: string;
  metricCode: string;
  result?: { canonical: unknown; current: unknown };
  version: string;
}

/**
 * The shadow executor must be supplied by a runtime that actually queries a
 * separately identified, read-only database. Adapters cannot use the default
 * application Prisma client for the shadow track because that only compares a
 * calculation with itself.
 */
export interface ShadowExecutionRuntime {
  primaryDatabaseIdentity: string;
  shadowDatabaseIdentity: string;
  shadowDatabaseReadOnly: boolean;
  calculateShadow: (
    adapter: MetricCalculationAdapter,
    context: ShadowCalculationContext,
  ) => Promise<unknown>;
}

export function defaultShadowExecutionWindow(
  now = new Date(),
): ShadowExecutionWindow {
  const end = new Date(now);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return { end, start };
}

function resolveScopeContext(
  scope: ShadowScope,
  access?: AnalyticsAccessContext,
): AnalyticsAccessContext | undefined {
  if (!access?.user?.userId?.trim()) return undefined;
  const resolvedScope = access?.dataScope?.scopeType ?? 'ALL';
  if (resolvedScope !== scope) return undefined;
  if (scope === 'DEPT' && !access?.dataScope?.deptIds.length) return undefined;
  return access;
}

function isIsolated(runtime?: ShadowExecutionRuntime): boolean {
  const primary = runtime?.primaryDatabaseIdentity.trim();
  const shadow = runtime?.shadowDatabaseIdentity.trim();
  return Boolean(primary && shadow && primary !== shadow);
}

export async function executeShadowMetric(
  metricCode: string,
  scope: ShadowScope,
  window = defaultShadowExecutionWindow(),
  version = 'v1',
  access?: AnalyticsAccessContext,
  runtime?: ShadowExecutionRuntime,
): Promise<ShadowExecutionResult> {
  const adapter = METRIC_CALCULATION_ADAPTERS[metricCode];
  const base = {
    dataScope: scope,
    executionWindow: {
      end: window.end.toISOString(),
      start: window.start.toISOString(),
    },
    metricCode,
    version,
  };
  if (!adapter)
    return {
      ...base,
      classification: 'BLOCKED',
      diff: [],
      issue: 'ADAPTER_NOT_REGISTERED',
    };
  const environment = checkShadowEnvironment(
    {
      endDate: window.end,
      accessScopeValid: Boolean(resolveScopeContext(scope, access)),
      metricCode,
      scope,
      startDate: window.start,
    },
    {
      adapterExists: true,
      shadowDatabaseIsolated: isIsolated(runtime),
      shadowDatabaseReadOnly: runtime?.shadowDatabaseReadOnly,
      shadowDatabaseUrl: process.env.DATABASE_URL_SHADOW,
      shadowExecutorAvailable: Boolean(runtime),
    },
  );
  if (environment.blocked)
    return {
      ...base,
      classification: 'BLOCKED',
      diff: [],
      issue: environment.reasons.join(','),
    };
  try {
    const scopedAccess = resolveScopeContext(scope, access);
    if (!scopedAccess || !runtime) {
      return {
        ...base,
        classification: 'BLOCKED',
        diff: [],
        issue: 'SHADOW_EXECUTION_PRECONDITION_FAILED',
      };
    }
    const isolatedSnapshot = await calculateShadowMetric(
      adapter,
      {
        asOf: window.end,
        end: window.end,
        scope: { type: scope },
        start: window.start,
        access: scopedAccess,
      } as ShadowCalculationContext,
      (context) => runtime.calculateShadow(adapter, context),
    );
    const evidence = buildShadowEvidence(isolatedSnapshot, version);
    return {
      ...base,
      classification: evidence.diff.status,
      diff: evidence.diff.fields,
      result: evidence.result,
    };
  } catch (error) {
    logger.error(error, 'controlled shadow execution failed');
    return {
      ...base,
      classification: 'BLOCKED',
      diff: [],
      issue: error instanceof Error ? error.message : 'SHADOW_EXECUTION_FAILED',
    };
  }
}

export async function executeFirstBatch(
  scope: ShadowScope,
  window = defaultShadowExecutionWindow(),
  access?: AnalyticsAccessContext,
  runtime?: ShadowExecutionRuntime,
): Promise<ShadowExecutionResult[]> {
  return Promise.all(
    [
      'BM-GROSS-QUALITY-LOSS',
      'BM-FIRST-PASS-YIELD',
      'BM-PROBLEM-CLOSURE-RATE',
    ].map((metricCode) =>
      executeShadowMetric(metricCode, scope, window, 'v1', access, runtime),
    ),
  );
}
