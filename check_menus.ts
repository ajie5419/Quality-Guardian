import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  try {
    const menus = await prisma.menus.findMany();
    console.log('Total menus:', menus.length);
    if (menus.length > 0) {
      console.log('Sample menus:', menus.slice(0, 3).map(m => ({ path: m.path, component: m.component })));
    } else {
      console.log('No menus found in database\!');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
