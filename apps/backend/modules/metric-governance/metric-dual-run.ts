import type { AnalyticsAccessContext } from '~/modules/data-scope';

import type { ShadowDiffStatus } from './metric-shadow-adapters';
import type { ShadowExecutionRuntime } from './metric-shadow-execution';

import { Prisma } from '@prisma/client';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { executeShadowMetric } from './metric-shadow-execution';

export type DualRunScope = 'ALL' | 'DEPT' | 'SELF';

export type GrossQualityLossConsumer =
  | 'ANALYTICS_API'
  | 'QUALITY_LOSS_DASHBOARD'
  | 'QUALITY_LOSS_SUMMARY';

export interface DualRunResult {
  canonicalResult: unknown;
  classification: ShadowDiffStatus;
  diff: Array<{ current: unknown; field: string; shadow: unknown }>;
  legacyResult: unknown;
  metricCode: 'BM-FIRST-PASS-YIELD' | 'BM-GROSS-QUALITY-LOSS';
  scope: DualRunScope;
  version: string;
}

export interface ConsumerDualRunEvidence extends DualRunResult {
  consumer: GrossQualityLossConsumer;
}

type DualRunInput = {
  access?: AnalyticsAccessContext;
  end: Date;
  runtime?: ShadowExecutionRuntime;
  scope: DualRunScope;
  start: Date;
  version?: string;
};

function requireVerifiedDualRun(input: DualRunInput, metricCode: string) {
  return executeShadowMetric(
    metricCode,
    input.scope,
    { end: input.end, start: input.start },
    input.version ?? 'v1',
    input.access,
    input.runtime,
  ).then((result) => {
    if (result.classification === 'BLOCKED' || !result.result) {
      throw new BusinessError(
        'CONFLICT',
        `Shadow dual run blocked: ${result.issue ?? 'RESULT_UNAVAILABLE'}`,
        409,
      );
    }
    return result;
  });
}

function toAuditableResult(
  result: { canonical: unknown; current: unknown },
  input: DualRunInput,
): Record<string, unknown> {
  return {
    canonical: result.canonical,
    current: result.current,
    execution: {
      accessScope: input.scope,
      primaryDatabaseIdentity: input.runtime?.primaryDatabaseIdentity,
      shadowDatabaseIdentity: input.runtime?.shadowDatabaseIdentity,
    },
  };
}

export async function executeGrossQualityLossDualRun(
  input: DualRunInput,
): Promise<DualRunResult> {
  const version = input.version ?? 'v1';
  const versionNumber = version === 'v1' ? 1 : Number(version);
  const execution = await requireVerifiedDualRun(
    input,
    'BM-GROSS-QUALITY-LOSS',
  );
  const result = execution.result;
  if (!result) throw new Error('SHADOW_RESULT_UNAVAILABLE');
  const evidenceResult = toAuditableResult(result, input);
  const definition = await prisma.metric_definitions.findUniqueOrThrow({
    where: { metricCode: 'BM-GROSS-QUALITY-LOSS' },
    select: { id: true },
  });
  const metricVersion = await prisma.metric_definition_versions.findFirst({
    where: { metricDefinitionId: definition.id, version: versionNumber },
  });
  if (!metricVersion) throw new Error('METRIC_VERSION_NOT_FOUND');
  await prisma.metric_shadow_validation_evidences.upsert({
    where: {
      metricDefinitionVersionId_executionWindowStartAt_executionWindowEndAt_scope:
        {
          metricDefinitionVersionId: metricVersion.id,
          executionWindowStartAt: input.start,
          executionWindowEndAt: input.end,
          scope: input.scope,
        },
    },
    create: {
      metricDefinitionVersion: { connect: { id: metricVersion.id } },
      metricCode: 'BM-GROSS-QUALITY-LOSS',
      version: versionNumber,
      executionWindowStartAt: input.start,
      executionWindowEndAt: input.end,
      scope: input.scope,
      result: structuredClone(evidenceResult) as Prisma.InputJsonValue,
      classification: execution.classification,
      sourceDocument:
        'docs/metrics/metric-gross-quality-loss-dual-run-report.md',
    },
    update: {
      result: structuredClone(evidenceResult) as Prisma.InputJsonValue,
      classification: execution.classification,
    },
  });
  return {
    canonicalResult: result.canonical,
    classification: execution.classification,
    diff: execution.diff,
    legacyResult: result.current,
    metricCode: 'BM-GROSS-QUALITY-LOSS',
    scope: input.scope,
    version,
  };
}

export async function executeGrossQualityLossConsumerDualRun(input: {
  access?: AnalyticsAccessContext;
  consumer: GrossQualityLossConsumer;
  end: Date;
  runtime?: ShadowExecutionRuntime;
  scope: DualRunScope;
  start: Date;
  version?: string;
}): Promise<ConsumerDualRunEvidence> {
  const result = await executeGrossQualityLossDualRun(input);
  return { ...result, consumer: input.consumer };
}

export async function executeFirstPassDualRun(
  input: DualRunInput,
): Promise<DualRunResult> {
  const version = input.version ?? 'v1';
  const versionNumber = version === 'v1' ? 1 : Number(version);
  const execution = await requireVerifiedDualRun(input, 'BM-FIRST-PASS-YIELD');
  const result = execution.result;
  if (!result) throw new Error('SHADOW_RESULT_UNAVAILABLE');
  const evidenceResult = toAuditableResult(result, input);
  const definition = await prisma.metric_definitions.findUniqueOrThrow({
    where: { metricCode: 'BM-FIRST-PASS-YIELD' },
    select: { id: true },
  });
  const metricVersion = await prisma.metric_definition_versions.findFirst({
    where: { metricDefinitionId: definition.id, version: versionNumber },
  });
  if (!metricVersion) throw new Error('METRIC_VERSION_NOT_FOUND');
  await prisma.metric_shadow_validation_evidences.upsert({
    where: {
      metricDefinitionVersionId_executionWindowStartAt_executionWindowEndAt_scope:
        {
          metricDefinitionVersionId: metricVersion.id,
          executionWindowStartAt: input.start,
          executionWindowEndAt: input.end,
          scope: input.scope,
        },
    },
    create: {
      metricDefinitionVersion: { connect: { id: metricVersion.id } },
      metricCode: 'BM-FIRST-PASS-YIELD',
      version: versionNumber,
      executionWindowStartAt: input.start,
      executionWindowEndAt: input.end,
      scope: input.scope,
      result: structuredClone(evidenceResult) as Prisma.InputJsonValue,
      classification: execution.classification,
      sourceDocument: 'docs/metrics/metric-dual-run-first-pass-yield-report.md',
    },
    update: {
      result: structuredClone(evidenceResult) as Prisma.InputJsonValue,
      classification: execution.classification,
    },
  });
  return {
    canonicalResult: result.canonical,
    classification: execution.classification,
    diff: execution.diff,
    legacyResult: result.current,
    metricCode: 'BM-FIRST-PASS-YIELD',
    scope: input.scope,
    version,
  };
}
