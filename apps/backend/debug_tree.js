/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const menus = await prisma.menus.findMany({
    where: { status: 1 },
    orderBy: { order: 'asc' },
  });

  console.log(`Total menus found: ${menus.length}`);

  // Check parent-child relationship for QMS Inspection Records (ID 41)
  const parent = menus.find((m) => m.id === 41);
  if (parent) {
    console.log('Parent found:', parent.name, parent.id, parent.type);
    const children = menus.filter((m) => m.parentId === 41);
    console.log(`Children for ID 41 found: ${children.length}`);
    children.forEach((c) => {
      console.log(
        ` - Child: ${c.name}, ID: ${c.id}, Type: ${c.type}, ParentID: ${c.parentId}`,
      );
    });
  } else {
    console.log('Parent menu with ID 41 not found');
  }

  // Check QMS Dashboard (ID 21)
  const dashboard = menus.find((m) => m.id === 21);
  if (dashboard) {
    console.log('Dashboard found:', dashboard.name, dashboard.id);
    const children = menus.filter((m) => m.parentId === 21);
    console.log(`Children for ID 21 found: ${children.length}`);
    children.forEach((c) => {
      console.log(` - Child: ${c.name}, ID: ${c.id}, Type: ${c.type}`);
    });
  }
}

main()
  .catch((error) => console.error(error))
  .finally(async () => await prisma.$disconnect());
