import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check QMS Inspection Issues (ID 42)
  const issues = await prisma.menus.findUnique({ where: { id: 42 } });
  if (issues) {
    console.log('Inspection Issues found:', issues.name);
    const children = await prisma.menus.findMany({ where: { parentId: 42 } });
    console.log(`Children for ID 42 (${children.length}):`);
    children.forEach(c => console.log(` - ${c.name} (${c.type}) auth: ${c.authCode}`));
  }

  // Check QMS After Sales (ID 50)
  const afterSales = await prisma.menus.findUnique({ where: { id: 50 } });
  if (afterSales) {
    console.log('After Sales found:', afterSales.name);
    const children = await prisma.menus.findMany({ where: { parentId: 50 } });
    console.log(`Children for ID 50 (${children.length}):`);
    children.forEach(c => console.log(` - ${c.name} (${c.type}) auth: ${c.authCode}`));
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
