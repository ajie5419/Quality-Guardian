import { defineEventHandler } from 'h3';
import prisma from '~/utils/prisma';

export default defineEventHandler(async () => {
  const users = await prisma.users.findMany({
    select: { id: true, username: true },
  });
  return { users };
});
