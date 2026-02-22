import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';

const VEHICLE_COMMISSIONING_PATH = '/qms/vehicle-commissioning';
const VEHICLE_COMMISSIONING_NAME = 'QMSVehicleCommissioning';
const VEHICLE_COMMISSIONING_AUTH_CODE = 'QMS:VehicleCommissioning:List';

function buildVehicleCommissioningMeta() {
  return JSON.stringify({
    icon: 'carbon:vehicle-connected',
    orderNo: 95,
    title: '车辆调试',
  });
}

/**
 * 自动补齐车辆调试菜单：
 * - 解决老环境数据库缺失菜单导致权限树/侧边栏看不到“车辆调试”的问题
 * - 幂等：存在则仅修正缺失字段，不重复创建
 */
export async function ensureVehicleCommissioningMenu() {
  const qmsRoot = await prisma.menus.findFirst({
    where: {
      isDeleted: false,
      path: '/qms',
      status: 1,
    },
    select: { id: true },
  });

  if (!qmsRoot?.id) {
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
        parentId: qmsRoot.id,
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
  if (existing.parentId !== qmsRoot.id) {
    nextData.parentId = qmsRoot.id;
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
