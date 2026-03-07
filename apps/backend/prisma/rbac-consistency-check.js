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

  throw new Error(
    'Unable to resolve @prisma/client for rbac-consistency-check',
  );
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

function normalize(values) {
  return [...new Set(values)].sort();
}

function equalCodes(a, b) {
  const left = normalize(a);
  const right = normalize(b);
  return (
    left.length === right.length &&
    left.every((code, idx) => code === right[idx])
  );
}

async function main() {
  const roleMismatches = [];
  const userMismatches = [];

  const roles = await prisma.roles.findMany({
    where: { isDeleted: false },
    select: { id: true, permissions: true, name: true },
  });

  for (const role of roles) {
    const legacyCodes = parsePermissions(role.permissions);
    const links = await prisma.rbac_role_permissions.findMany({
      where: { roleId: role.id },
      include: { permission: true },
    });
    const v2Codes = links
      .map((item) => item.permission?.code)
      .filter((item) => typeof item === 'string');

    if (!equalCodes(legacyCodes, v2Codes)) {
      roleMismatches.push({
        roleId: role.id,
        roleName: role.name,
        legacyCount: legacyCodes.length,
        v2Count: v2Codes.length,
      });
    }
  }

  const users = await prisma.users.findMany({
    where: { isDeleted: false },
    select: { id: true, roleId: true, username: true },
  });
  for (const user of users) {
    const primaryLink = await prisma.rbac_user_roles.findFirst({
      where: { userId: user.id, roleId: user.roleId },
      select: { id: true },
    });
    if (!primaryLink) {
      userMismatches.push({
        roleId: user.roleId,
        userId: user.id,
        username: user.username,
      });
    }
  }

  const summary = {
    roleMismatches,
    roleMismatchCount: roleMismatches.length,
    userMismatches,
    userMismatchCount: userMismatches.length,
  };

  console.log('[rbac-consistency-check]', JSON.stringify(summary));

  if (summary.roleMismatchCount > 0 || summary.userMismatchCount > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[rbac-consistency-check] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
