import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const count = await prisma.menus.count();
    console.log(`Total menus: ${count}`);
    
    const rootMenus = await prisma.menus.findMany({
      where: { parentId: 0 },
      select: { name: true, id: true }
    });
    console.log('Root menus:', rootMenus);

    const superRole = await prisma.roles.findUnique({
      where: { id: '1' }
    });
    console.log('Super role permissions length:', superRole?.permissions?.length);
    console.log('Sample permissions:', superRole?.permissions?.slice(0, 100));

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
