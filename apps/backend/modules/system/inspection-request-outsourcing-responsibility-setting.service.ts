import type { Prisma } from '@prisma/client';
import type { InspectionIssueResponsibilityType } from '@qgs/shared';

import {
  INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
  INSPECTION_ISSUE_RESPONSIBILITY_TYPE,
  OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
} from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export const PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY =
  'INSPECTION_REQUEST_PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID';
export const INCOMING_SUPPLIER_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY =
  'INSPECTION_REQUEST_INCOMING_SUPPLIER_RESPONSIBLE_DEPARTMENT_ID';

type ResponsibilityDepartmentPolicy = {
  bootstrapUnresolvedCode: string;
  configurationInvalidCode: string;
  description: string;
  legacyDepartmentName: string;
  settingKey: string;
};

const RESPONSIBILITY_DEPARTMENT_POLICY: Partial<
  Record<InspectionIssueResponsibilityType, ResponsibilityDepartmentPolicy>
> = {
  [INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT]: {
    bootstrapUnresolvedCode:
      'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_BOOTSTRAP_UNRESOLVED',
    configurationInvalidCode:
      'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_CONFIGURATION_INVALID',
    description:
      'Canonical department ID for outsourcing inspection request responsibility',
    legacyDepartmentName: OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT,
    settingKey: PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
  },
  [INSPECTION_ISSUE_RESPONSIBILITY_TYPE.SUPPLIER]: {
    bootstrapUnresolvedCode:
      'INCOMING_SUPPLIER_RESPONSIBLE_DEPARTMENT_BOOTSTRAP_UNRESOLVED',
    configurationInvalidCode:
      'INCOMING_SUPPLIER_RESPONSIBLE_DEPARTMENT_CONFIGURATION_INVALID',
    description:
      'Canonical department ID for incoming supplier inspection request responsibility',
    legacyDepartmentName: INCOMING_INSPECTION_RESPONSIBLE_DEPARTMENT,
    settingKey: INCOMING_SUPPLIER_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
  },
};
const logger = createModuleLogger(
  'inspection-request-outsourcing-responsibility-setting',
);

type SettingClient = Pick<
  Prisma.TransactionClient,
  'departments' | 'system_settings'
>;

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function getResponsibilityDepartmentPolicy(
  responsibilityType: InspectionIssueResponsibilityType,
) {
  const policy = RESPONSIBILITY_DEPARTMENT_POLICY[responsibilityType];
  if (!policy) {
    throw new BusinessError(
      'INSPECTION_REQUEST_RESPONSIBILITY_DEPARTMENT_CONFIGURATION_UNSUPPORTED',
      'The responsibility type does not use a configured department',
      400,
    );
  }
  return policy;
}

async function resolveActiveDepartmentById(
  id: string,
  policy: ResponsibilityDepartmentPolicy,
  client: SettingClient,
) {
  const department = await DeptService.findActiveById(id, client);
  if (!department) {
    throw new BusinessError(
      policy.configurationInvalidCode,
      'The configured inspection request responsibility department is inactive or missing',
      409,
    );
  }
  return department;
}

/**
 * The setting freezes canonical identity, not a department name. The legacy
 * name is consulted only to initialize an absent setting when it is unique.
 */
export const InspectionRequestResponsibilityDepartmentSettingService = {
  async getConfiguredDepartmentId(
    responsibilityType: InspectionIssueResponsibilityType,
    client: SettingClient = prisma,
  ) {
    const policy = getResponsibilityDepartmentPolicy(responsibilityType);
    const setting = await client.system_settings.findUnique({
      where: { key: policy.settingKey },
      select: { value: true },
    });
    return String(setting?.value || '').trim() || null;
  },

  async resolveConfiguredDepartment(
    responsibilityType: InspectionIssueResponsibilityType,
    client: SettingClient = prisma,
  ) {
    const policy = getResponsibilityDepartmentPolicy(responsibilityType);
    const configuredId = await this.getConfiguredDepartmentId(
      responsibilityType,
      client,
    );
    if (configuredId) {
      return resolveActiveDepartmentById(configuredId, policy, client);
    }
    return await this.bootstrapFromUniqueLegacyName(responsibilityType, client);
  },

  async bootstrapFromUniqueLegacyName(
    responsibilityType: InspectionIssueResponsibilityType,
    client: SettingClient = prisma,
  ) {
    const policy = getResponsibilityDepartmentPolicy(responsibilityType);
    const candidates = await DeptService.findActiveByIdsOrNames(
      { names: [policy.legacyDepartmentName] },
      client,
    );
    if (candidates.length !== 1 || !candidates[0]) {
      throw new BusinessError(
        policy.bootstrapUnresolvedCode,
        `Cannot bootstrap inspection request responsibility department: expected one active legacy policy department, found ${candidates.length}`,
        409,
      );
    }

    try {
      await client.system_settings.create({
        data: {
          key: policy.settingKey,
          value: candidates[0].id,
          description: policy.description,
        },
      });
      return await resolveActiveDepartmentById(
        candidates[0].id,
        policy,
        client,
      );
    } catch (error) {
      logger.error(
        { err: error },
        'PROCESS outsourcing responsibility bootstrap create failed',
      );
      if (!isUniqueConstraintError(error)) throw error;
      const concurrentlyConfiguredId = await this.getConfiguredDepartmentId(
        responsibilityType,
        client,
      );
      if (!concurrentlyConfiguredId) throw error;
      return await resolveActiveDepartmentById(
        concurrentlyConfiguredId,
        policy,
        client,
      );
    }
  },
};

/** Backward-compatible facade for existing outsourcing callers and maintenance. */
export const ProcessOutsourcingResponsibleDepartmentSettingService = {
  async resolveConfiguredDepartment(client: SettingClient = prisma) {
    return InspectionRequestResponsibilityDepartmentSettingService.resolveConfiguredDepartment(
      INSPECTION_ISSUE_RESPONSIBILITY_TYPE.OUTSOURCING_UNIT,
      client,
    );
  },
};
