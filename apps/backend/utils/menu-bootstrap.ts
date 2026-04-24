import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const VEHICLE_COMMISSIONING_PATH = '/qms/vehicle-commissioning';
const VEHICLE_COMMISSIONING_NAME = 'QMSVehicleCommissioning';
const VEHICLE_COMMISSIONING_AUTH_CODE = 'QMS:VehicleCommissioning:List';

const METROLOGY_CATALOG_PATH = '/qms/metrology';
const METROLOGY_CATALOG_NAME = 'QMSMetrologyManagement';
const METROLOGY_LEDGER_PATH = '/qms/metrology/ledger';
const METROLOGY_LEDGER_LEGACY_PATH = '/qms/metrology';
const METROLOGY_LEDGER_NAME = 'QMSMetrologyLedger';
const METROLOGY_LEDGER_LEGACY_NAME = 'QMSMetrology';
const METROLOGY_LEDGER_AUTH_CODE = 'QMS:Metrology:List';
const METROLOGY_CALIBRATION_PLAN_PATH = '/qms/metrology/calibration-plan';
const METROLOGY_CALIBRATION_PLAN_NAME = 'QMSMetrologyCalibrationPlan';
const METROLOGY_CALIBRATION_PLAN_AUTH_CODE =
  'QMS:Metrology:CalibrationPlan:List';
const METROLOGY_BORROW_PATH = '/qms/metrology/borrow';
const METROLOGY_BORROW_NAME = 'QMSMetrologyBorrow';
const METROLOGY_BORROW_AUTH_CODE = 'QMS:Metrology:Borrow:List';
const METROLOGY_BORROW_ENTRY_PATH = '/qms/metrology/borrow/entry';
const METROLOGY_BORROW_ENTRY_NAME = 'QMSMetrologyBorrowEntry';

const METROLOGY_LEDGER_BUTTONS = [
  {
    authCode: 'QMS:Metrology:Create',
    name: 'QMSMetrologyCreate',
    order: 1,
    title: '新建',
  },
  {
    authCode: 'QMS:Metrology:Edit',
    name: 'QMSMetrologyEdit',
    order: 2,
    title: '编辑',
  },
  {
    authCode: 'QMS:Metrology:Delete',
    name: 'QMSMetrologyDelete',
    order: 3,
    title: '删除',
  },
  {
    authCode: 'QMS:Metrology:Import',
    name: 'QMSMetrologyImport',
    order: 4,
    title: '导入',
  },
  {
    authCode: 'QMS:Metrology:Export',
    name: 'QMSMetrologyExport',
    order: 5,
    title: '导出',
  },
] as const;

const METROLOGY_CALIBRATION_PLAN_BUTTONS = [
  {
    authCode: 'QMS:Metrology:CalibrationPlan:Create',
    name: 'QMSMetrologyCalibrationPlanCreate',
    order: 1,
    title: '新建',
  },
  {
    authCode: 'QMS:Metrology:CalibrationPlan:Edit',
    name: 'QMSMetrologyCalibrationPlanEdit',
    order: 2,
    title: '编辑',
  },
  {
    authCode: 'QMS:Metrology:CalibrationPlan:Delete',
    name: 'QMSMetrologyCalibrationPlanDelete',
    order: 3,
    title: '删除',
  },
  {
    authCode: 'QMS:Metrology:CalibrationPlan:Import',
    name: 'QMSMetrologyCalibrationPlanImport',
    order: 4,
    title: '导入',
  },
] as const;

const METROLOGY_BORROW_BUTTONS = [
  {
    authCode: 'QMS:Metrology:Borrow:Create',
    name: 'QMSMetrologyBorrowCreate',
    order: 1,
    title: '借用',
  },
  {
    authCode: 'QMS:Metrology:Borrow:Return',
    name: 'QMSMetrologyBorrowReturn',
    order: 2,
    title: '归还',
  },
] as const;

function buildVehicleCommissioningMeta() {
  return JSON.stringify({
    icon: 'carbon:vehicle-connected',
    orderNo: 95,
    title: '车辆调试',
  });
}

function buildMetrologyCatalogMeta() {
  return JSON.stringify({
    icon: 'carbon:ruler-alt',
    orderNo: 96,
    title: '计量器具管理',
  });
}

function buildMetrologyLedgerMeta() {
  return JSON.stringify({
    icon: 'carbon:notebook',
    title: '计量器具台账',
  });
}

function buildMetrologyCalibrationPlanMeta() {
  return JSON.stringify({
    icon: 'carbon:calendar',
    title: '计量器具校准计划',
  });
}

function buildMetrologyBorrowMeta() {
  return JSON.stringify({
    icon: 'carbon:qr-code',
    title: '量具借用管理',
  });
}

function buildMetrologyBorrowEntryMeta() {
  return JSON.stringify({
    activePath: METROLOGY_BORROW_PATH,
    hideInMenu: true,
    publicAccess: true,
    title: '扫码借还入口',
  });
}

async function ensureButtons(
  buttons: ReadonlyArray<{
    authCode: string;
    name: string;
    order: number;
    title: string;
  }>,
  parentId: string,
) {
  let changed = false;

  for (const button of buttons) {
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
          id: `menu-${Date.now()}-${button.name}`,
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
      changed = true;
      continue;
    }

    const nextData: Record<string, unknown> = {};
    if (existing.isDeleted) {
      nextData.isDeleted = false;
    }
    if (existing.status !== 1) {
      nextData.status = 1;
    }
    if (existing.parentId !== parentId) {
      nextData.parentId = parentId;
    }
    if (existing.type !== 'button') {
      nextData.type = 'button';
    }
    if (!existing.authCode) {
      nextData.authCode = button.authCode;
    }
    if (!existing.meta) {
      nextData.meta = meta;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: existing.id },
        data: nextData,
      });
      changed = true;
    }
  }

  return changed;
}

async function getQmsRootId() {
  const qmsRoot = await prisma.menus.findFirst({
    where: {
      isDeleted: false,
      path: '/qms',
      status: 1,
    },
    select: { id: true },
  });

  return qmsRoot?.id ? String(qmsRoot.id) : null;
}

/**
 * 自动补齐车辆调试菜单：
 * - 解决老环境数据库缺失菜单导致权限树/侧边栏看不到“车辆调试”的问题
 * - 幂等：存在则仅修正缺失字段，不重复创建
 */
export async function ensureVehicleCommissioningMenu() {
  const qmsRootId = await getQmsRootId();
  if (!qmsRootId) {
    return;
  }

  const existing = await prisma.menus.findFirst({
    where: {
      OR: [
        { name: VEHICLE_COMMISSIONING_NAME },
        { path: VEHICLE_COMMISSIONING_PATH },
      ],
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

  if (!existing) {
    await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-vc`,
        authCode: VEHICLE_COMMISSIONING_AUTH_CODE,
        component: '/qms/vehicle-commissioning/index.vue',
        isDeleted: false,
        meta: buildVehicleCommissioningMeta(),
        name: VEHICLE_COMMISSIONING_NAME,
        order: 95,
        parentId: qmsRootId,
        path: VEHICLE_COMMISSIONING_PATH,
        status: 1,
        type: 'menu',
      },
    });
    await redis.delByPattern('qms:menu:*');
    return;
  }

  const nextData: Record<string, unknown> = {};
  if (existing.isDeleted) {
    nextData.isDeleted = false;
  }
  if (existing.status !== 1) {
    nextData.status = 1;
  }
  if (existing.parentId !== qmsRootId) {
    nextData.parentId = qmsRootId;
  }
  if (existing.type !== 'menu') {
    nextData.type = 'menu';
  }
  if (!existing.authCode) {
    nextData.authCode = VEHICLE_COMMISSIONING_AUTH_CODE;
  }
  if (!existing.meta) {
    nextData.meta = buildVehicleCommissioningMeta();
  }

  if (Object.keys(nextData).length > 0) {
    await prisma.menus.update({
      where: { id: existing.id },
      data: nextData,
    });
    await redis.delByPattern('qms:menu:*');
  }
}

/**
 * 自动补齐计量器具管理菜单：
 * - 迁移旧结构：将历史单菜单 `/qms/metrology` 收敛到“台账”子菜单
 * - 新结构：父级目录 + 台账 + 校准计划 + 借用管理
 */
export async function ensureMetrologyMenu() {
  const qmsRootId = await getQmsRootId();
  if (!qmsRootId) {
    return;
  }

  let changed = false;

  const catalogExisting = await prisma.menus.findFirst({
    where: {
      OR: [
        { name: METROLOGY_CATALOG_NAME },
        { path: METROLOGY_CATALOG_PATH, type: 'catalog' },
      ],
    },
    select: {
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

  let catalogId = catalogExisting?.id ? String(catalogExisting.id) : '';

  if (catalogExisting) {
    const nextData: Record<string, unknown> = {};
    if (catalogExisting.isDeleted) {
      nextData.isDeleted = false;
    }
    if (catalogExisting.status !== 1) {
      nextData.status = 1;
    }
    if (catalogExisting.parentId !== qmsRootId) {
      nextData.parentId = qmsRootId;
    }
    if (catalogExisting.type !== 'catalog') {
      nextData.type = 'catalog';
    }
    if (catalogExisting.path !== METROLOGY_CATALOG_PATH) {
      nextData.path = METROLOGY_CATALOG_PATH;
    }
    if (catalogExisting.redirect !== METROLOGY_LEDGER_PATH) {
      nextData.redirect = METROLOGY_LEDGER_PATH;
    }
    if (!catalogExisting.meta) {
      nextData.meta = buildMetrologyCatalogMeta();
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: catalogExisting.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    const created = await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-metrology-management`,
        isDeleted: false,
        meta: buildMetrologyCatalogMeta(),
        name: METROLOGY_CATALOG_NAME,
        order: 96,
        parentId: qmsRootId,
        path: METROLOGY_CATALOG_PATH,
        redirect: METROLOGY_LEDGER_PATH,
        status: 1,
        type: 'catalog',
      },
    });
    catalogId = String(created.id);
    changed = true;
  }

  const ledgerExisting = await prisma.menus.findFirst({
    where: {
      OR: [
        { name: METROLOGY_LEDGER_NAME },
        { name: METROLOGY_LEDGER_LEGACY_NAME },
        { path: METROLOGY_LEDGER_PATH },
        { path: METROLOGY_LEDGER_LEGACY_PATH, type: 'menu' },
      ],
    },
    select: {
      authCode: true,
      component: true,
      id: true,
      isDeleted: true,
      meta: true,
      name: true,
      parentId: true,
      path: true,
      status: true,
      type: true,
    },
  });

  let ledgerId = ledgerExisting?.id ? String(ledgerExisting.id) : '';

  if (ledgerExisting) {
    const nextData: Record<string, unknown> = {};
    if (ledgerExisting.isDeleted) {
      nextData.isDeleted = false;
    }
    if (ledgerExisting.status !== 1) {
      nextData.status = 1;
    }
    if (ledgerExisting.parentId !== catalogId) {
      nextData.parentId = catalogId;
    }
    if (ledgerExisting.type !== 'menu') {
      nextData.type = 'menu';
    }
    if (ledgerExisting.path !== METROLOGY_LEDGER_PATH) {
      nextData.path = METROLOGY_LEDGER_PATH;
    }
    if (ledgerExisting.name !== METROLOGY_LEDGER_NAME) {
      nextData.name = METROLOGY_LEDGER_NAME;
    }
    if (ledgerExisting.component !== 'qms/metrology/index') {
      nextData.component = 'qms/metrology/index';
    }
    if (!ledgerExisting.authCode) {
      nextData.authCode = METROLOGY_LEDGER_AUTH_CODE;
    }
    if (
      !ledgerExisting.meta ||
      ledgerExisting.path === METROLOGY_LEDGER_LEGACY_PATH ||
      !String(ledgerExisting.meta).includes('"icon"')
    ) {
      nextData.meta = buildMetrologyLedgerMeta();
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: ledgerExisting.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    const created = await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-metrology-ledger`,
        authCode: METROLOGY_LEDGER_AUTH_CODE,
        component: 'qms/metrology/index',
        isDeleted: false,
        meta: buildMetrologyLedgerMeta(),
        name: METROLOGY_LEDGER_NAME,
        order: 1,
        parentId: catalogId,
        path: METROLOGY_LEDGER_PATH,
        status: 1,
        type: 'menu',
      },
    });
    ledgerId = String(created.id);
    changed = true;
  }

  const calibrationExisting = await prisma.menus.findFirst({
    where: {
      OR: [
        { name: METROLOGY_CALIBRATION_PLAN_NAME },
        { path: METROLOGY_CALIBRATION_PLAN_PATH },
      ],
    },
    select: {
      authCode: true,
      component: true,
      id: true,
      isDeleted: true,
      meta: true,
      name: true,
      parentId: true,
      path: true,
      status: true,
      type: true,
    },
  });

  let calibrationId = calibrationExisting?.id
    ? String(calibrationExisting.id)
    : '';

  if (calibrationExisting) {
    const nextData: Record<string, unknown> = {};
    if (calibrationExisting.isDeleted) {
      nextData.isDeleted = false;
    }
    if (calibrationExisting.status !== 1) {
      nextData.status = 1;
    }
    if (calibrationExisting.parentId !== catalogId) {
      nextData.parentId = catalogId;
    }
    if (calibrationExisting.type !== 'menu') {
      nextData.type = 'menu';
    }
    if (calibrationExisting.path !== METROLOGY_CALIBRATION_PLAN_PATH) {
      nextData.path = METROLOGY_CALIBRATION_PLAN_PATH;
    }
    if (
      calibrationExisting.component !== 'qms/metrology/calibration-plan/index'
    ) {
      nextData.component = 'qms/metrology/calibration-plan/index';
    }
    if (!calibrationExisting.authCode) {
      nextData.authCode = METROLOGY_CALIBRATION_PLAN_AUTH_CODE;
    }
    if (
      !calibrationExisting.meta ||
      !String(calibrationExisting.meta).includes('"icon"')
    ) {
      nextData.meta = buildMetrologyCalibrationPlanMeta();
    }
    if (calibrationExisting.name !== METROLOGY_CALIBRATION_PLAN_NAME) {
      nextData.name = METROLOGY_CALIBRATION_PLAN_NAME;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: calibrationExisting.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    const created = await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-metrology-calibration-plan`,
        authCode: METROLOGY_CALIBRATION_PLAN_AUTH_CODE,
        component: 'qms/metrology/calibration-plan/index',
        isDeleted: false,
        meta: buildMetrologyCalibrationPlanMeta(),
        name: METROLOGY_CALIBRATION_PLAN_NAME,
        order: 2,
        parentId: catalogId,
        path: METROLOGY_CALIBRATION_PLAN_PATH,
        status: 1,
        type: 'menu',
      },
    });
    calibrationId = String(created.id);
    changed = true;
  }

  const borrowExisting = await prisma.menus.findFirst({
    where: {
      OR: [{ name: METROLOGY_BORROW_NAME }, { path: METROLOGY_BORROW_PATH }],
    },
    select: {
      authCode: true,
      component: true,
      id: true,
      isDeleted: true,
      meta: true,
      name: true,
      parentId: true,
      path: true,
      status: true,
      type: true,
    },
  });

  let borrowId = borrowExisting?.id ? String(borrowExisting.id) : '';

  if (borrowExisting) {
    const nextData: Record<string, unknown> = {};
    if (borrowExisting.isDeleted) {
      nextData.isDeleted = false;
    }
    if (borrowExisting.status !== 1) {
      nextData.status = 1;
    }
    if (borrowExisting.parentId !== catalogId) {
      nextData.parentId = catalogId;
    }
    if (borrowExisting.type !== 'menu') {
      nextData.type = 'menu';
    }
    if (borrowExisting.path !== METROLOGY_BORROW_PATH) {
      nextData.path = METROLOGY_BORROW_PATH;
    }
    if (borrowExisting.component !== 'qms/metrology/borrow/index') {
      nextData.component = 'qms/metrology/borrow/index';
    }
    if (!borrowExisting.authCode) {
      nextData.authCode = METROLOGY_BORROW_AUTH_CODE;
    }
    if (
      !borrowExisting.meta ||
      !String(borrowExisting.meta).includes('"icon"')
    ) {
      nextData.meta = buildMetrologyBorrowMeta();
    }
    if (borrowExisting.name !== METROLOGY_BORROW_NAME) {
      nextData.name = METROLOGY_BORROW_NAME;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: borrowExisting.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    const created = await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-metrology-borrow`,
        authCode: METROLOGY_BORROW_AUTH_CODE,
        component: 'qms/metrology/borrow/index',
        isDeleted: false,
        meta: buildMetrologyBorrowMeta(),
        name: METROLOGY_BORROW_NAME,
        order: 3,
        parentId: catalogId,
        path: METROLOGY_BORROW_PATH,
        status: 1,
        type: 'menu',
      },
    });
    borrowId = String(created.id);
    changed = true;
  }

  const borrowEntryExisting = await prisma.menus.findFirst({
    where: {
      OR: [
        { name: METROLOGY_BORROW_ENTRY_NAME },
        { path: METROLOGY_BORROW_ENTRY_PATH },
      ],
    },
    select: {
      authCode: true,
      component: true,
      id: true,
      isDeleted: true,
      meta: true,
      name: true,
      parentId: true,
      path: true,
      status: true,
      type: true,
    },
  });

  if (borrowEntryExisting) {
    const nextData: Record<string, unknown> = {};
    if (borrowEntryExisting.isDeleted) {
      nextData.isDeleted = false;
    }
    if (borrowEntryExisting.status !== 1) {
      nextData.status = 1;
    }
    if (borrowEntryExisting.parentId !== catalogId) {
      nextData.parentId = catalogId;
    }
    if (borrowEntryExisting.type !== 'menu') {
      nextData.type = 'menu';
    }
    if (borrowEntryExisting.path !== METROLOGY_BORROW_ENTRY_PATH) {
      nextData.path = METROLOGY_BORROW_ENTRY_PATH;
    }
    if (borrowEntryExisting.component !== 'qms/metrology/borrow/entry/index') {
      nextData.component = 'qms/metrology/borrow/entry/index';
    }
    if (borrowEntryExisting.authCode !== null) {
      nextData.authCode = null;
    }
    if (
      !borrowEntryExisting.meta ||
      !String(borrowEntryExisting.meta).includes('"publicAccess":true')
    ) {
      nextData.meta = buildMetrologyBorrowEntryMeta();
    }
    if (borrowEntryExisting.name !== METROLOGY_BORROW_ENTRY_NAME) {
      nextData.name = METROLOGY_BORROW_ENTRY_NAME;
    }

    if (Object.keys(nextData).length > 0) {
      await prisma.menus.update({
        where: { id: borrowEntryExisting.id },
        data: nextData,
      });
      changed = true;
    }
  } else {
    await prisma.menus.create({
      data: {
        id: `menu-${Date.now()}-metrology-borrow-entry`,
        authCode: null,
        component: 'qms/metrology/borrow/entry/index',
        isDeleted: false,
        meta: buildMetrologyBorrowEntryMeta(),
        name: METROLOGY_BORROW_ENTRY_NAME,
        order: 99,
        parentId: catalogId,
        path: METROLOGY_BORROW_ENTRY_PATH,
        status: 1,
        type: 'menu',
      },
    });
    changed = true;
  }

  const buttonsChanged = await Promise.all([
    ensureButtons(METROLOGY_LEDGER_BUTTONS, ledgerId),
    ensureButtons(METROLOGY_CALIBRATION_PLAN_BUTTONS, calibrationId),
    ensureButtons(METROLOGY_BORROW_BUTTONS, borrowId),
  ]);

  if (changed || buttonsChanged.some(Boolean)) {
    await redis.delByPattern('qms:menu:*');
  }
}
