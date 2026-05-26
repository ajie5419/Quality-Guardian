import type {
  ModuleAuditActionDeclaration,
  ModuleDataScopeDeclaration,
  ModuleDeclaration,
  ModuleMenuDeclaration,
} from '~/utils/module-types';

import { afterSalesModule } from '~/modules/after-sales/after-sales.module';
import { aiModule } from '~/modules/ai/ai.module';
import { dashboardModule } from '~/modules/dashboard/dashboard.module';
import { dataScopeModule } from '~/modules/data-scope/data-scope.module';
import { deptModule } from '~/modules/dept/dept.module';
import { dictionaryModule } from '~/modules/dictionary/dictionary.module';
import { fileStorageModule } from '~/modules/file-storage/file-storage.module';
import { inspectionModule } from '~/modules/inspection/inspection.module';
import { knowledgeModule } from '~/modules/knowledge/knowledge.module';
import { metrologyModule } from '~/modules/metrology/metrology.module';
import { planningModule } from '~/modules/planning/planning.module';
import { qualityLossModule } from '~/modules/quality-loss/quality-loss.module';
import { rbacModule } from '~/modules/rbac/rbac.module';
import { reportModule } from '~/modules/report/report.module';
import { routeHandlersModule } from '~/modules/route-handlers/route-handlers.module';
import { supervisionModule } from '~/modules/supervision/supervision.module';
import { supplierModule } from '~/modules/supplier/supplier.module';
import { systemLogModule } from '~/modules/system-log/system-log.module';
import { systemModule } from '~/modules/system/system.module';
import { taskDispatchModule } from '~/modules/task-dispatch/task-dispatch.module';
import { userModule } from '~/modules/user/user.module';
import { vehicleCommissioningModule } from '~/modules/vehicle-commissioning/vehicle-commissioning.module';
import { welderModule } from '~/modules/welder/welder.module';
import { workOrderRequirementModule } from '~/modules/work-order-requirement/work-order-requirement.module';
import { workOrderModule } from '~/modules/work-order/work-order.module';

const MODULE_DECLARATIONS: ModuleDeclaration[] = [
  afterSalesModule,
  aiModule,
  dashboardModule,
  dataScopeModule,
  deptModule,
  dictionaryModule,
  fileStorageModule,
  inspectionModule,
  knowledgeModule,
  metrologyModule,
  planningModule,
  qualityLossModule,
  rbacModule,
  reportModule,
  routeHandlersModule,
  supervisionModule,
  supplierModule,
  systemModule,
  systemLogModule,
  taskDispatchModule,
  userModule,
  vehicleCommissioningModule,
  welderModule,
  workOrderModule,
  workOrderRequirementModule,
];

let moduleCache: Map<string, ModuleDeclaration> | null = null;

export function loadModules(): ModuleDeclaration[] {
  if (!moduleCache) {
    moduleCache = new Map(
      MODULE_DECLARATIONS.map((declaration) => [declaration.name, declaration]),
    );
  }

  return [...moduleCache.values()];
}

export function getModuleDeclaration(
  moduleName: string,
): ModuleDeclaration | undefined {
  if (!moduleCache) {
    loadModules();
  }
  return moduleCache?.get(moduleName);
}

export function getMenuDeclarations(): ModuleMenuDeclaration[] {
  return loadModules().flatMap((declaration) => declaration.menus ?? []);
}

export function getDataScopeConfig(
  moduleName: string,
): ModuleDataScopeDeclaration | undefined {
  return getModuleDeclaration(moduleName)?.dataScope;
}

export function getDataScopeModuleNames(): string[] {
  return loadModules()
    .filter((declaration) => Boolean(declaration.dataScope))
    .map((declaration) => declaration.name);
}

export function getAuditConfig(
  moduleName: string,
): Record<string, ModuleAuditActionDeclaration> | undefined {
  return getModuleDeclaration(moduleName)?.audit;
}

export function getAuditActionConfig(
  moduleName: string,
  actionKey: string,
): ModuleAuditActionDeclaration | undefined {
  return getAuditConfig(moduleName)?.[actionKey];
}
