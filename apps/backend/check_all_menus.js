import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 获取所有菜单
  const menus = await prisma.menus.findMany({
    where: { status: 1 },
    orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
  });

  console.log(`\n=== 数据库菜单总数: ${menus.length} ===\n`);

  // 按类型统计
  const catalogs = menus.filter(m => m.type === 'catalog');
  const pages = menus.filter(m => m.type === 'menu');
  const buttons = menus.filter(m => m.type === 'button');

  console.log(`目录(catalog): ${catalogs.length}`);
  console.log(`页面(menu): ${pages.length}`);
  console.log(`按钮(button): ${buttons.length}`);

  // 列出所有顶级菜单
  console.log('\n=== 顶级菜单 ===');
  const roots = menus.filter(m => m.parentId === 0);
  roots.forEach(r => {
    console.log(`  ${r.id}: ${r.name} (${r.type})`);
  });

  // 列出所有页面及其按钮
  console.log('\n=== 页面与按钮明细 ===');
  for (const page of pages) {
    const pageButtons = menus.filter(m => m.parentId === page.id && m.type === 'button');
    console.log(`\n[${page.id}] ${page.name} - 按钮数: ${pageButtons.length}`);
    pageButtons.forEach(b => {
      console.log(`    └─ ${b.name}: ${b.authCode}`);
    });
  }
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
