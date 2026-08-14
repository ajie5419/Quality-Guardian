import process from 'node:process';

import { ProcessOutsourcingResponsibleDepartmentSettingService } from '~/modules/system';
import { createModuleLogger } from '~/utils/logger';

const logger = createModuleLogger(
  'inspection-request-process-outsourcing-responsibility-bootstrap',
);

export async function bootstrapProcessOutsourcingResponsibleDepartment() {
  const department =
    await ProcessOutsourcingResponsibleDepartmentSettingService.resolveConfiguredDepartment();
  return { id: department.id, name: department.name };
}

if (
  process.argv[1]?.endsWith(
    'bootstrap-inspection-request-process-outsourcing-responsibility.ts',
  )
) {
  bootstrapProcessOutsourcingResponsibleDepartment()
    .then((department) => {
      logger.info(
        { department },
        'PROCESS outsourcing responsibility department configuration verified',
      );
    })
    .catch((error: unknown) => {
      logger.fatal(
        { err: error },
        'PROCESS outsourcing responsibility department bootstrap failed',
      );
      process.exitCode = 1;
    });
}
