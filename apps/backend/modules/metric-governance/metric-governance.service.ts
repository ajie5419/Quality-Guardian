import type {
  CreateMetricDefinitionInput,
  MetricGovernanceActor,
  MetricVersionInput,
  NewMetricVersionInput,
  UpdateMetricDefinitionInput,
} from './metric-governance.types';

import { SystemLogService } from '~/modules/system-log';
import { BusinessError } from '~/utils/business-error';
import prisma from '~/utils/prisma';

import { assertActivationReadiness } from './metric-governance-readiness';
import {
  assertExpectedRevision,
  assertMetricCode,
  assertNoExecutableMetadata,
} from './metric-governance-validation';

const definitionInclude = {
  ownerAssignments: true,
  versions: {
    orderBy: { version: 'desc' as const },
    include: {
      activationEvidences: true,
      approvalEvidences: true,
      policyDependencies: true,
      shadowEvidences: true,
    },
  },
};

function compactSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

function assertVersionInput(input: MetricVersionInput): void {
  assertNoExecutableMetadata(input.sourceModel);
  assertNoExecutableMetadata(input.sourceFields);
  assertNoExecutableMetadata(input.dimensions);
  assertNoExecutableMetadata(input.exclusions);
  if (
    !input.businessDefinition.trim() ||
    !input.refreshPolicy.trim() ||
    !input.unit.trim()
  ) {
    throw new BusinessError(
      'BAD_REQUEST',
      '指标版本的定义、刷新策略和单位不能为空',
      400,
    );
  }
  if (
    !Number.isInteger(input.precision) ||
    input.precision < 0 ||
    input.precision > 8
  ) {
    throw new BusinessError('BAD_REQUEST', '指标精度必须是 0 到 8 的整数', 400);
  }
  if (input.effectiveToAt && input.effectiveToAt < input.effectiveFromAt) {
    throw new BusinessError('BAD_REQUEST', '版本结束时间不能早于生效时间', 400);
  }
}

function assertDefinitionMetadata(input: {
  domain?: string;
  metricName?: string;
  ownerDeptId?: null | string;
  ownerStatus?: string;
}): void {
  if (input.metricName !== undefined && !input.metricName.trim()) {
    throw new BusinessError('BAD_REQUEST', '指标名称不能为空', 400);
  }
  if (input.domain !== undefined && !input.domain.trim()) {
    throw new BusinessError('BAD_REQUEST', '指标域不能为空', 400);
  }
  if (input.ownerStatus === 'CONFIRMED' && !input.ownerDeptId) {
    throw new BusinessError(
      'BAD_REQUEST',
      '已确认 Owner 时必须指定责任部门',
      400,
    );
  }
  if (input.ownerStatus === 'UNCONFIRMED' && input.ownerDeptId) {
    throw new BusinessError(
      'BAD_REQUEST',
      '未知 Owner 不允许伪造责任部门',
      400,
    );
  }
  if (input.ownerStatus === 'CONFIRMED_FROM_APPROVAL' && input.ownerDeptId) {
    throw new BusinessError(
      'BAD_REQUEST',
      '审批确认的业务责任不允许伪造责任部门 ID',
      400,
    );
  }
}

async function auditMetricChange(input: {
  action:
    | 'activate'
    | 'create'
    | 'deprecate'
    | 'newVersion'
    | 'ownerChange'
    | 'updateDraft';
  actor: MetricGovernanceActor;
  after: unknown;
  before?: unknown;
  changeReason?: null | string;
  metricCode: string;
  targetId: string;
  version: number;
}): Promise<void> {
  await SystemLogService.auditLog('metric-governance', input.action, {
    detailsVariables: {
      actor: input.actor.userId,
      after: compactSnapshot(input.after),
      before: compactSnapshot(input.before ?? null),
      changeReason: input.changeReason ?? 'Not provided',
      metricCode: input.metricCode,
      version: input.version,
    },
    targetId: input.targetId,
    userId: input.actor.userId,
  });
}

async function getDefinitionOrThrow(id: string) {
  const definition = await prisma.metric_definitions.findUnique({
    where: { id },
    include: definitionInclude,
  });
  if (!definition) {
    throw new BusinessError('NOT_FOUND', '指标定义不存在', 404);
  }
  return definition;
}

function assertDraft(definition: { status: string }): void {
  if (definition.status !== 'DRAFT') {
    throw new BusinessError('CONFLICT', '只有草稿指标可以直接更新', 409);
  }
}

function assertNotDeprecated(definition: { status: string }): void {
  if (definition.status === 'DEPRECATED') {
    throw new BusinessError('CONFLICT', '已废弃指标不能新增版本', 409);
  }
}

export const MetricGovernanceService = {
  async listDefinitions() {
    return prisma.metric_definitions.findMany({
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: [{ category: 'asc' }, { metricCode: 'asc' }],
    });
  },

  async getDefinition(id: string) {
    return getDefinitionOrThrow(id);
  },

  async createDefinition(
    input: CreateMetricDefinitionInput,
    actor: MetricGovernanceActor,
  ) {
    assertMetricCode(input.metricCode);
    assertDefinitionMetadata(input);
    assertVersionInput(input.version);

    const existing = await prisma.metric_definitions.findUnique({
      where: { metricCode: input.metricCode },
      select: { id: true },
    });
    if (existing) {
      throw new BusinessError('CONFLICT', '指标编码已存在', 409);
    }

    const definition = await prisma.metric_definitions.create({
      data: {
        metricCode: input.metricCode,
        metricName: input.metricName.trim(),
        domain: input.domain.trim(),
        category: input.category,
        ownerDeptId: input.ownerDeptId ?? null,
        ownerStatus: input.ownerStatus ?? 'UNCONFIRMED',
        createdBy: actor.userId,
        currentVersion: 1,
        versions: {
          create: { ...input.version, version: 1, createdBy: actor.userId },
        },
      },
      include: definitionInclude,
    });
    await auditMetricChange({
      action: 'create',
      actor,
      after: definition,
      changeReason: input.version.changeReason,
      metricCode: definition.metricCode,
      targetId: definition.id,
      version: definition.currentVersion,
    });
    return definition;
  },

  async updateDraft(
    id: string,
    input: UpdateMetricDefinitionInput,
    actor: MetricGovernanceActor,
  ) {
    assertExpectedRevision(input.expectedRevision);
    assertDefinitionMetadata(input);
    const current = await getDefinitionOrThrow(id);
    assertDraft(current);
    if (current.revision !== input.expectedRevision) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义已被其他用户修改，请刷新后重试',
        409,
      );
    }

    const update = await prisma.metric_definitions.updateMany({
      where: { id, status: 'DRAFT', revision: input.expectedRevision },
      data: {
        category: input.category,
        domain: input.domain?.trim(),
        metricName: input.metricName?.trim(),
        ownerDeptId: input.ownerDeptId,
        ownerStatus: input.ownerStatus,
        revision: { increment: 1 },
      },
    });
    if (update.count !== 1) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义状态已变化，请刷新后重试',
        409,
      );
    }
    const after = await getDefinitionOrThrow(id);
    await auditMetricChange({
      action:
        current.ownerDeptId !== after.ownerDeptId ||
        current.ownerStatus !== after.ownerStatus
          ? 'ownerChange'
          : 'updateDraft',
      actor,
      after,
      before: current,
      metricCode: after.metricCode,
      targetId: after.id,
      version: after.currentVersion,
    });
    return after;
  },

  async activate(
    id: string,
    expectedRevision: number,
    actor: MetricGovernanceActor,
  ) {
    assertExpectedRevision(expectedRevision);
    const current = await getDefinitionOrThrow(id);
    assertDraft(current);
    if (current.revision !== expectedRevision) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义已被其他用户修改，请刷新后重试',
        409,
      );
    }
    const currentVersion = current.versions.find(
      (item) => item.version === current.currentVersion,
    );
    if (!currentVersion) {
      throw new BusinessError('CONFLICT', '当前指标版本不存在', 409);
    }
    if (currentVersion.conflictStatus === 'BUSINESS_DECISION_REQUIRED') {
      throw new BusinessError(
        'CONFLICT',
        '存在业务口径冲突的指标不能激活',
        409,
      );
    }
    assertActivationReadiness(current);

    // Activation evidence is append-only. Its effective date satisfies
    // readiness but must never rewrite the immutable definition version.
    const update = await prisma.metric_definitions.updateMany({
      where: { id, status: 'DRAFT', revision: expectedRevision },
      data: { status: 'ACTIVE', revision: { increment: 1 } },
    });
    if (update.count !== 1)
      throw new BusinessError(
        'CONFLICT',
        '指标定义状态已变化，请刷新后重试',
        409,
      );
    const after = await getDefinitionOrThrow(id);
    await auditMetricChange({
      action: 'activate',
      actor,
      after,
      before: current,
      metricCode: after.metricCode,
      targetId: after.id,
      version: after.currentVersion,
    });
    return after;
  },

  async createNewVersion(
    id: string,
    input: NewMetricVersionInput,
    actor: MetricGovernanceActor,
  ) {
    assertExpectedRevision(input.expectedRevision);
    assertVersionInput(input);
    const current = await getDefinitionOrThrow(id);
    assertNotDeprecated(current);
    if (current.revision !== input.expectedRevision) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义已被其他用户修改，请刷新后重试',
        409,
      );
    }

    const nextVersion = current.currentVersion + 1;
    const { expectedRevision: _expectedRevision, ...versionInput } = input;
    void _expectedRevision;
    const after = await prisma.$transaction(async (tx) => {
      const update = await tx.metric_definitions.updateMany({
        where: {
          id,
          revision: input.expectedRevision,
          status: { in: ['DRAFT', 'ACTIVE'] },
        },
        data: { currentVersion: nextVersion, revision: { increment: 1 } },
      });
      if (update.count !== 1) {
        throw new BusinessError(
          'CONFLICT',
          '指标定义状态已变化，请刷新后重试',
          409,
        );
      }
      await tx.metric_definition_versions.create({
        data: {
          ...versionInput,
          metricDefinitionId: id,
          version: nextVersion,
          createdBy: actor.userId,
        },
      });
      const definition = await tx.metric_definitions.findUnique({
        where: { id },
        include: definitionInclude,
      });
      if (!definition) {
        throw new BusinessError('NOT_FOUND', '指标定义不存在', 404);
      }
      return definition;
    });

    await auditMetricChange({
      action: 'newVersion',
      actor,
      after,
      before: current,
      changeReason: input.changeReason,
      metricCode: after.metricCode,
      targetId: after.id,
      version: after.currentVersion,
    });
    return after;
  },

  async deprecate(
    id: string,
    expectedRevision: number,
    changeReason: string,
    actor: MetricGovernanceActor,
  ) {
    assertExpectedRevision(expectedRevision);
    if (!changeReason.trim()) {
      throw new BusinessError('BAD_REQUEST', '废弃指标必须说明原因', 400);
    }
    const current = await getDefinitionOrThrow(id);
    if (current.status === 'DEPRECATED') {
      throw new BusinessError('CONFLICT', '指标已经废弃', 409);
    }
    if (current.revision !== expectedRevision) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义已被其他用户修改，请刷新后重试',
        409,
      );
    }
    const update = await prisma.metric_definitions.updateMany({
      where: {
        id,
        revision: expectedRevision,
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      data: { status: 'DEPRECATED', revision: { increment: 1 } },
    });
    if (update.count !== 1) {
      throw new BusinessError(
        'CONFLICT',
        '指标定义状态已变化，请刷新后重试',
        409,
      );
    }
    const after = await getDefinitionOrThrow(id);
    await auditMetricChange({
      action: 'deprecate',
      actor,
      after,
      before: current,
      changeReason,
      metricCode: after.metricCode,
      targetId: after.id,
      version: after.currentVersion,
    });
    return after;
  },
};
