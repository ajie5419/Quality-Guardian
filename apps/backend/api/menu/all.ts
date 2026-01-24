import { eventHandler } from 'h3';
import { verifyAccessToken } from '~/utils/jwt-utils';
import prisma from '~/utils/prisma';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

/**
 * 将平铺的菜单数据转换为树形结构
 */
function buildMenuTree(menus: any[], parentId: number = 0): any[] {
  return menus
    .filter((menu) => (menu.parentId || 0) === parentId)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((menu) => {
      const children = buildMenuTree(menus, menu.id);
      const meta =
        typeof menu.meta === 'string' ? JSON.parse(menu.meta) : menu.meta;

      return {
        ...menu,
        meta,
        children: children.length > 0 ? children : undefined,
      };
    });
}

/**
 * 收集菜单及其所有子按钮的权限码
 */
function collectMenuAuthCodes(menu: any): string[] {
  const codes: string[] = [];
  if (menu.authCode) {
    codes.push(menu.authCode);
  }
  if (menu.children) {
    for (const child of menu.children) {
      codes.push(...collectMenuAuthCodes(child));
    }
  }
  return codes;
}

/**
 * 检查用户是否有权限访问菜单
 * 规则：用户拥有菜单本身的权限码 OR 菜单下任意子按钮的权限码
 */
function hasMenuAccess(menu: any, userCodesSet: Set<string>): boolean {
  // 如果菜单本身没有权限码要求，直接通过
  if (!menu.authCode && menu.type !== 'menu') {
    return true;
  }

  // 收集该菜单及其所有子节点的权限码
  const menuCodes = collectMenuAuthCodes(menu);

  // 只要用户拥有其中任意一个权限码，就允许访问
  return menuCodes.some((code) => userCodesSet.has(code));
}

/**
 * 递归过滤菜单 (针对侧边栏显示)
 */
function filterMenus(
  menus: any[],
  userCodesSet: Set<string>,
  skipAuthCheck = false,
): any[] {
  return menus
    .filter((menu) => {
      // 1. 过滤掉按钮类型 - 侧边栏不显示按钮
      if (menu.type === 'button') {
        return false;
      }

      // 2. 权限校验逻辑
      if (!skipAuthCheck && !hasMenuAccess(menu, userCodesSet)) {
        return false;
      }

      // 3. 递归处理子级
      if (menu.children && menu.children.length > 0) {
        const visibleChildren = filterMenus(
          menu.children,
          userCodesSet,
          skipAuthCheck,
        );
        menu.children = visibleChildren;

        // 如果是目录类型且没有任何可见的子页面，则该目录也应该隐藏
        if (menu.type === 'catalog' && visibleChildren.length === 0) {
          return false;
        }
      }

      return true;
    })
    .map((menu) => ({ ...menu }));
}

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  // 1. 获取所有状态正常的菜单
  const allDbMenus = await prisma.menus.findMany({
    where: { status: 1 },
    orderBy: { order: 'asc' },
  });

  // 2. 获取用户真实权限
  let userPermissions: string[] = [];
  let roleName = '';

  const uid = userinfo.userId || userinfo.id;

  try {
    const dbUser = await prisma.users.findFirst({
      where: {
        OR: [{ id: String(uid) }, { username: userinfo.username }],
      },
      include: {
        roles: true,
      },
    });

    if (dbUser && dbUser.roles) {
      roleName = dbUser.roles.name;
      try {
        userPermissions = JSON.parse(dbUser.roles.permissions || '[]');
      } catch {
        console.error('Permissions parse error');
      }
    }
  } catch (error) {
    console.error('Menu auth sync error:', error);
  }

  // 3. 构建完整树
  const fullMenuTree = buildMenuTree(allDbMenus);

  // 4. 执行过滤
  const isSuper =
    roleName.toLowerCase().includes('super') ||
    userPermissions.includes('*') ||
    userPermissions.includes('["*"]') ||
    uid === '1' ||
    uid === 'USR-ADMIN';

  // 将权限列表转为 Set 提高查询效率
  const userCodesSet = new Set(userPermissions);

  // 如果是超级管理员，直接返回所有菜单，不需要经过 filterMenus 的繁琐校验
  // 这样可以确保哪怕是坏数据，管理员也能进得去
  let filteredMenus: any[] = [];
  if (isSuper) {
    filteredMenus = fullMenuTree.map(m => ({ ...m }));
  } else {
    filteredMenus = filterMenus(fullMenuTree, userCodesSet, false);
  }

  // 额外调试日志 (Docker 生产环境下会输出到 docker logs)
  console.warn(`[Menu] User: ${userinfo.username}, isSuper: ${isSuper}, Count: ${filteredMenus.length}`);

  return useResponseSuccess(filteredMenus);
});
