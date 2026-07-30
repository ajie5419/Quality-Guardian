import type {
  ModuleAuditActionDeclaration,
  ModuleDataScopeDeclaration,
  ModuleDeclaration,
  ModuleMenuButtonDeclaration,
  ModuleMenuDeclaration,
} from '~/utils/module-types';

import { createId } from '@paralleldrive/cuid2';
import { Prisma } from '@prisma/client';
import { afterSalesModule } from '~/modules/after-sales/after-sales.module';
import { aiModule } from '~/modules/ai/ai.module';
import { dashboardModule } from '~/modules/dashboard/dashboard.module';
import { dataScopeModule } from '~/modules/data-scope/data-scope.module';
import { deptModule } from '~/modules/dept/dept.module';
import { dictionaryModule } from '~/modules/dictionary/dictionary.module';
import { fileStorageModule } from '~/modules/file-storage/file-storage.module';
import { inspectionModule } from '~/modules/inspection/inspection.module';
import { knowledgeModule } from '~/modules/knowledge/knowledge.module';
import { metricRefreshModule } from '~/modules/metric-refresh/metric-refresh.module';
import { metrologyModule } from '~/modules/metrology/metrology.module';
import { partMasterModule } from '~/modules/part-master/part-master.module';
import { planningModule } from '~/modules/planning/planning.module';
import { processMasterModule } from '~/modules/process-master/process-master.module';
import { qualityClassificationModule } from '~/modules/quality-classification/quality-classification.module';
import { qualityLossModule } from '~/modules/quality-loss/quality-loss.module';
import { rbacModule } from '~/modules/rbac/rbac.module';
import { reportModule } from '~/modules/report/report.module';
import { supervisionModule } from '~/modules/supervision/supervision.module';
import { supplierIdentityModule } from '~/modules/supplier-identity/supplier-identity.module';
import { supplierModule } from '~/modules/supplier/supplier.module';
import { systemLogModule } from '~/modules/system-log/system-log.module';
import { systemModule } from '~/modules/system/system.module';
import { taskDispatchModule } from '~/modules/task-dispatch/task-dispatch.module';
import { teamModule } from '~/modules/team/team.module';
import { userModule } from '~/modules/user/user.module';
import { vehicleCommissioningModule } from '~/modules/vehicle-commissioning/vehicle-commissioning.module';
import { welderModule } from '~/modules/welder/welder.module';
import { workOrderRequirementModule } from '~/modules/work-order-requirement/work-order-requirement.module';
import { workOrderModule } from '~/modules/work-order/work-order.module';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

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
  metricRefreshModule,
  metrologyModule,
  partMasterModule,
  planningModule,
  processMasterModule,
  qualityClassificationModule,
  qualityLossModule,
  rbacModule,
  reportModule,
  supervisionModule,
  supplierModule,
  supplierIdentityModule,
  systemModule,
  systemLogModule,
  taskDispatchModule,
  teamModule,
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

function buildMenuLookupWhere(
  declaration: ModuleMenuDeclaration,
): Prisma.menusWhereInput {
  return {
    OR: [
      { name: declaration.name },
      ...(declaration.legacyNames ?? []).map((name) => ({ name })),
      { path: declaration.path },
      ...(declaration.legacyPaths ?? []).map((path) => ({ path })),
    ],
  };
}

async function findMenuByPath(path: string) {
  return prisma.menus.findFirst({
    where: {
      isDeleted: false,
      path,
      status: 1,
    },
    select: { id: true },
  });
}

async function ensureButton(
  button: ModuleMenuButtonDeclaration,
  parentId: string,
) {
  const existing = await prisma.menus.findFirst({
    where: {
      OR: [{ authCode: button.authCode }, { name: button.name }],
    },
    select: {
      authCode: true,
      id: true,
      isDeleted: true,
      meta: true,
      parentId: true,
      status: true,
      type: true,
    },
  });
  const meta = JSON.stringify({ title: button.title });

  if (!existing) {
    await prisma.menus.create({
      data: {
        id: `menu-${createId()}-${button.name}`,
        authCode: button.authCode,
        isDeleted: false,
        meta,
        name: button.name,
        order: button.order,
        parentId,
        status: 1,
        type: 'button',
      },
    });
    return true;
  }

  const nextData: Prisma.menusUpdateInput = {};
  if (existing.isDeleted) nextData.isDeleted = false;
  if (existing.status !== 1) nextData.status = 1;
  if (existing.parentId !== parentId) nextData.parentId = parentId;
  if (existing.type !== 'button') nextData.type = 'button';
  if (!existing.authCode) nextData.authCode = button.authCode;
  if (existing.meta !== meta) nextData.meta = meta;

  if (Object.keys(nextData).length === 0) {
    return false;
  }

  await prisma.menus.update({
    where: { id: existing.id },
    data: nextData,
  });
  return true;
}

async function ensureMenu(declaration: ModuleMenuDeclaration) {
  const parent = declaration.parentPath
    ? await findMenuByPath(declaration.parentPath)
    : null;
  const parentId = parent?.id ?? null;
  if (declaration.parentPath && !parentId) {
    return false;
  }

  let changed = false;
  const candidates = await prisma.menus.findMany({
    where: buildMenuLookupWhere(declaration),
    select: {
      authCode: true,
      component: true,
      id: true,
      isDeleted: true,
      meta: true,
      name: true,
      parentId: true,
      path: true,
      redirect: true,
      status: true,
      type: true,
    },
  });
  const existing =
    candidates.find(
      (item) =>
        item.name === declaration.name || item.path === declaration.path,
    ) ?? candidates[0];
  const meta = JSON.stringify(declaration.meta);
  let menuId = existing?.id ? String(existing.id) : '';

  if (existing) {
    const nextData: Prisma.menusUpdateInput = {};
    if (existing.isDeleted) nextData.isDeleted = false;
    if (existing.status !== 1) nextData.status = 1;
    if (existing.type !== declaration.type) nextData.type = declaration.type;
    if (existing.name !== declaration.name) nextData.name = declaration.name;
    if (existing.path !== declaration.path) nextData.path = declaration.path;
    if (parentId && existing.parentId !== parentId)
      nextData.parentId = parentId;
    if (existing.component !== declaration.component) {
      nextData.component = declaration.component;
    }
    if (declaration.authCode !== undefined) {
      if (existing.authCode !== declaration.authCode) {
        nextData.authCode = declaration.authCode;
      }
    } else if (!existing.authCode) {
      nextData.authCode = declaration.authCode;
    }
    if (existing.redirect !== declaration.redirect) {
      nextData.redirect = declaration.redirect;
    }
    if (!existing.meta || existing.meta !== meta) {
      nextData.meta = meta;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: existing.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    const created = await prisma.menus.create({
      data: {
        id: `menu-${createId()}-${declaration.key}`,
        authCode: declaration.authCode,
        component: declaration.component,
        isDeleted: false,
        meta,
        name: declaration.name,
        order: declaration.order,
        parentId,
        path: declaration.path,
        redirect: declaration.redirect,
        status: 1,
        type: declaration.type,
      },
    });
    changed = true;
    menuId = String(created.id);
  }

  for (const button of declaration.buttons ?? []) {
    changed = (await ensureButton(button, menuId)) || changed;
  }

  return changed;
}

export async function ensureModuleMenus() {
  const changed = [];

  for (const declaration of getMenuDeclarations()) {
    changed.push(await ensureMenu(declaration));
  }

  if (changed.some(Boolean)) {
    await redis.delByPattern('qms:menu:*');
  }
}
