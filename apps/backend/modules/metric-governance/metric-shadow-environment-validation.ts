import { createModuleLogger } from '~/utils/logger';

export interface ShadowEnvironmentValidationInput {
  adapterAvailable: boolean;
  databaseUrlShadow?: string;
  executeReadOnlyCheck?: () => Promise<{
    databaseIdentity: string;
    readonly: boolean;
    tables: string[];
  }>;
  timestamp?: Date;
}

export interface ShadowEnvironmentValidationReport {
  availableTables: string[];
  connectionStatus: 'BLOCKED' | 'CONNECTED';
  databaseIdentity: string;
  readonlyVerification: 'BLOCKED' | 'FAIL' | 'PASS';
  unavailableDependencies: string[];
  validationTimestamp: string;
}

export async function validateShadowEnvironment(
  input: ShadowEnvironmentValidationInput,
): Promise<ShadowEnvironmentValidationReport> {
  const unavailableDependencies: string[] = [];
  const timestamp = (input.timestamp ?? new Date()).toISOString();
  if (!input.databaseUrlShadow?.trim())
    unavailableDependencies.push('DATABASE_URL_SHADOW_MISSING');
  if (!input.adapterAvailable)
    unavailableDependencies.push('METRIC_ADAPTER_UNAVAILABLE');
  if (unavailableDependencies.length > 0 || !input.executeReadOnlyCheck) {
    if (!input.executeReadOnlyCheck)
      unavailableDependencies.push('READONLY_CONNECTION_CHECK_UNAVAILABLE');
    return {
      availableTables: [],
      connectionStatus: 'BLOCKED',
      databaseIdentity: 'UNAVAILABLE',
      readonlyVerification: 'BLOCKED',
      unavailableDependencies,
      validationTimestamp: timestamp,
    };
  }
  try {
    const result = await input.executeReadOnlyCheck();
    if (!result.readonly)
      unavailableDependencies.push('DATABASE_USER_NOT_READONLY');
    return {
      availableTables: result.tables,
      connectionStatus:
        unavailableDependencies.length > 0 ? 'BLOCKED' : 'CONNECTED',
      databaseIdentity: result.databaseIdentity,
      readonlyVerification: result.readonly ? 'PASS' : 'FAIL',
      unavailableDependencies,
      validationTimestamp: timestamp,
    };
  } catch (error) {
    logger.error(error, 'shadow readonly validation failed');
    return {
      availableTables: [],
      connectionStatus: 'BLOCKED',
      databaseIdentity: 'UNAVAILABLE',
      readonlyVerification: 'BLOCKED',
      unavailableDependencies: ['SHADOW_DATABASE_UNAVAILABLE'],
      validationTimestamp: timestamp,
    };
  }
}

const logger = createModuleLogger('MetricShadowEnvironmentValidation');
