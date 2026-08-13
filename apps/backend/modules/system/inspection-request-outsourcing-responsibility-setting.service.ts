import type { Prisma } from '@prisma/client';

import { OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT } from '@qgs/shared';
import { DeptService } from '~/modules/dept';
import { BusinessError } from '~/utils/business-error';
import { createModuleLogger } from '~/utils/logger';
import prisma from '~/utils/prisma';

export const PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY =
  'INSPECTION_REQUEST_PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID';

const SETTING_DESCRIPTION =
  'Canonical department ID for PROCESS outsourcing inspection request responsibility';
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

async function resolveActiveDepartmentById(id: string, client: SettingClient) {
  const department = await DeptService.findActiveById(id, client);
  if (!department) {
    throw new BusinessError(
      'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_CONFIGURATION_INVALID',
      'The configured PROCESS outsourcing responsibility department is inactive or missing',
      409,
    );
  }
  return department;
}

/**
 * The setting freezes canonical identity, not a department name. The legacy
 * name is consulted only to initialize an absent setting when it is unique.
 */
export const ProcessOutsourcingResponsibleDepartmentSettingService = {
  async getConfiguredDepartmentId(client: SettingClient = prisma) {
    const setting = await client.system_settings.findUnique({
      where: {
        key: PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
      },
      select: { value: true },
    });
    return String(setting?.value || '').trim() || null;
  },

  async resolveConfiguredDepartment(client: SettingClient = prisma) {
    const configuredId = await this.getConfiguredDepartmentId(client);
    if (configuredId) {
      return resolveActiveDepartmentById(configuredId, client);
    }
    return await this.bootstrapFromUniqueLegacyName(client);
  },

  async bootstrapFromUniqueLegacyName(client: SettingClient = prisma) {
    const candidates = await DeptService.findActiveByIdsOrNames(
      { names: [OUTSOURCING_INSPECTION_RESPONSIBLE_DEPARTMENT] },
      client,
    );
    if (candidates.length !== 1 || !candidates[0]) {
      throw new BusinessError(
        'PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_BOOTSTRAP_UNRESOLVED',
        `Cannot bootstrap PROCESS outsourcing responsibility department: expected one active legacy policy department, found ${candidates.length}`,
        409,
      );
    }

    try {
      await client.system_settings.create({
        data: {
          key: PROCESS_OUTSOURCING_RESPONSIBLE_DEPARTMENT_ID_SETTING_KEY,
          value: candidates[0].id,
          description: SETTING_DESCRIPTION,
        },
      });
      return await resolveActiveDepartmentById(candidates[0].id, client);
    } catch (error) {
      logger.error(
        { err: error },
        'PROCESS outsourcing responsibility bootstrap create failed',
      );
      if (!isUniqueConstraintError(error)) throw error;
      const concurrentlyConfiguredId =
        await this.getConfiguredDepartmentId(client);
      if (!concurrentlyConfiguredId) throw error;
      return await resolveActiveDepartmentById(
        concurrentlyConfiguredId,
        client,
      );
    }
  },
};
