/* eslint-disable no-console */
import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);

function loadPrismaClient() {
  const candidates = [
    '@prisma/client',
    '../node_modules/@prisma/client',
    '../apps/backend/node_modules/@prisma/client',
  ];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // 继续尝试下一个候选路径，兼容本地源码与容器部署目录差异
    }
  }

  throw new Error('Unable to resolve @prisma/client for rbac-backfill');
}

const prismaPkg = loadPrismaClient();
const { PrismaClient } = prismaPkg;
const prisma = new PrismaClient();

function parsePermissions(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === 'string' && item.trim() !== '',
    );
  } catch {
    return [];
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  console.log('[rbac-backfill] start');

  const [roles, users] = await Promise.all([
    prisma.roles.findMany({ where: { isDeleted: false } }),
    prisma.users.findMany({ where: { isDeleted: false } }),
  ]);

  const allCodes = new Set();
  for (const role of roles) {
    for (const code of parsePermissions(role.permissions)) {
      allCodes.add(code);
    }
  }

  const existingPerms = await prisma.rbac_permissions.findMany({
    where: { code: { in: [...allCodes] } },
    select: { code: true },
  });
  const existingCodes = new Set(existingPerms.map((item) => item.code));

  const createPerms = [...allCodes]
    .filter((code) => !existingCodes.has(code))
    .map((code) => ({
      id: uid('rbac-perm'),
      code,
      name: code,
      module: code.split(':')[0] || 'QMS',
      isDeleted: false,
    }));

  if (createPerms.length > 0) {
    await prisma.rbac_permissions.createMany({
      data: createPerms,
      skipDuplicates: true,
    });
  }

  const allPerms = await prisma.rbac_permissions.findMany({
    where: { code: { in: [...allCodes] } },
    select: { code: true, id: true },
  });
  const permIdByCode = new Map(allPerms.map((item) => [item.code, item.id]));

  for (const role of roles) {
    const codes = parsePermissions(role.permissions);
    const permissionIds = codes
      .map((code) => permIdByCode.get(code))
      .filter(Boolean);

    await prisma.rbac_role_permissions.deleteMany({
      where: { roleId: role.id },
    });
    if (permissionIds.length > 0) {
      await prisma.rbac_role_permissions.createMany({
        data: permissionIds.map((permissionId) => ({
          id: uid('rbac-rp'),
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }
  }

  for (const user of users) {
    if (!user.roleId) continue;
    await prisma.rbac_user_roles.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: user.roleId,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        id: uid('rbac-ur'),
        userId: user.id,
        roleId: user.roleId,
      },
    });
  }

  console.log('[rbac-backfill] done');
}

main()
  .catch((error) => {
    console.error('[rbac-backfill] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
