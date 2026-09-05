import type { ShadowScope } from './metric-shadow-execution';

import process from 'node:process';

export interface ShadowExecutionRunConfig {
  endDate: Date;
  accessScopeValid: boolean;
  metricCode: string;
  scope: ShadowScope;
  startDate: Date;
}

export type ShadowEnvironmentBlockReason =
  | 'DATABASE_URL_SHADOW_MISSING'
  | 'DATASCOPE_ACCESS_INVALID'
  | 'INVALID_EXECUTION_WINDOW'
  | 'METRIC_ADAPTER_MISSING'
  | 'SHADOW_DATABASE_NOT_ISOLATED'
  | 'SHADOW_DATABASE_WRITE_ENABLED'
  | 'SHADOW_EXECUTOR_UNAVAILABLE';

export interface ShadowEnvironmentCheck {
  blocked: boolean;
  reasons: ShadowEnvironmentBlockReason[];
}

export function checkShadowEnvironment(
  config: ShadowExecutionRunConfig,
  options?: {
    adapterExists: boolean;
    shadowDatabaseIsolated?: boolean;
    shadowDatabaseReadOnly?: boolean;
    shadowDatabaseUrl?: string;
    shadowExecutorAvailable?: boolean;
  },
): ShadowEnvironmentCheck {
  const resolvedOptions = options ?? {
    adapterExists: false,
    shadowDatabaseUrl: process.env.DATABASE_URL_SHADOW,
  };
  const reasons: ShadowEnvironmentBlockReason[] = [];
  if (!resolvedOptions.shadowDatabaseUrl?.trim())
    reasons.push('DATABASE_URL_SHADOW_MISSING');
  if (config.startDate >= config.endDate)
    reasons.push('INVALID_EXECUTION_WINDOW');
  if (!resolvedOptions.adapterExists) reasons.push('METRIC_ADAPTER_MISSING');
  if (!config.accessScopeValid) reasons.push('DATASCOPE_ACCESS_INVALID');
  if (!resolvedOptions.shadowExecutorAvailable)
    reasons.push('SHADOW_EXECUTOR_UNAVAILABLE');
  if (
    resolvedOptions.shadowExecutorAvailable &&
    !resolvedOptions.shadowDatabaseIsolated
  )
    reasons.push('SHADOW_DATABASE_NOT_ISOLATED');
  if (
    resolvedOptions.shadowExecutorAvailable &&
    !resolvedOptions.shadowDatabaseReadOnly
  )
    reasons.push('SHADOW_DATABASE_WRITE_ENABLED');
  return { blocked: reasons.length > 0, reasons };
}

export function assertShadowEnvironment(check: ShadowEnvironmentCheck): void {
  if (check.blocked)
    throw new Error(`SHADOW_EXECUTION_BLOCKED:${check.reasons.join(',')}`);
}
