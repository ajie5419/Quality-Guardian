import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  try {
    // 1. Resolve Role first to avoid Unique Constraint errors
    // Try finding by ID 'super'
    let role = await prisma.roles.findUnique({ where: { id: 'super' } });

    // If not found by ID, try finding by Name 'Super Admin'
    if (!role) {
      role = await prisma.roles.findUnique({ where: { name: 'Super Admin' } });
    }

    // If still not found, we intend to create it.
    // But we need to construct the connect/create logic for the User upsert carefully.

    const roleConnect = role
      ? { connect: { id: role.id } }
      : {
          create: {
            id: 'super',
            name: 'Super Admin',
            permissions: '["*"]',
            status: 1,
          },
        };

    // 2. Upsert user 'vben'
    const _vben = await prisma.users.upsert({
      where: { username: 'vben' },
      update: {
        password: '123456',
        realName: 'Vben Admin',
        roles: roleConnect,
      },
      create: {
        id: 'USR-ADMIN',
        username: 'vben',
        password: '123456',
        realName: 'Vben Admin',
        department: 'IT',
        roles: roleConnect,
      },
    });

    // 3. List all users
    const users = await prisma.users.findMany({
      select: {
        username: true,
        password: true,
        roles: { select: { name: true } },
      },
    });

    return {
      status: 'success',
      message: 'User vben password reset to 123456',
      roleUsed: role ? 'Existing' : 'Created',
      currentUserList: users,
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
    };
  }
});
